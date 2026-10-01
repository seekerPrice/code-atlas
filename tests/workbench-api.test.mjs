import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {createServer} from '../server/index.mjs';

test('workbench saves structured evidence across restart, supplies test excerpts, and rejects stale reuse',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'atlas-workbench-')),repo=path.join(root,'repo');await mkdir(repo);
 await writeFile(path.join(repo,'main.ts'),'export function validate(value: string){return value.trim();}');
 await writeFile(path.join(repo,'main.test.ts'),'import {validate} from "./main";\nexport function check(){return validate("valid-test-input");}');
 await writeFile(path.join(repo,'package.json'),JSON.stringify({scripts:{test:'node --test'}}));
 let calls=0,lastPrompt='',server;
 const explain=async prompt=>{calls++;lastPrompt=prompt;return JSON.stringify({summary:'Input is trimmed.',claims:[{claim:'Trims input',evidence:[{path:'main.ts',line:1}],assumptions:[],unknowns:[]}],findings:[],lesson:null});};
 async function start(){server=createServer({explain,cacheDirectory:path.join(root,'answers')});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,{token}=await(await fetch(base+'/api/session')).json();return async(url,data,method)=>{const res=await fetch(base+url,{method:method||(data?'POST':'GET'),headers:{'X-Atlas-Token':token,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});return res;};}
 async function stop(){server.closeAllConnections();await new Promise(r=>server.close(r));}
 try{
  let request=await start();let project=await(await request('/api/project',{path:repo})).json();
  const feature=await request('/api/feature?q=validate');assert.equal(feature.status,200);assert((await feature.json()).stops.length);
  const tests=await(await request('/api/test-evidence?file=main.ts')).json();assert.equal(tests.tests[0].path,'main.test.ts');
  const input={revision:project.revision,mode:'verify',file:'main.ts',selection:'',question:'Check input handling',history:[],structured:true,depth:'syntax'};
  const response=await request('/api/explain',input);assert.equal(response.status,200);const events=(await response.text()).trim().split('\n').map(JSON.parse),answer=events.find(e=>e.type==='answer');
  assert.equal(answer.coaching.claims[0].evidence[0].path,'main.ts');assert.equal(answer.depth,'syntax');assert.match(lastPrompt,/valid-test-input/);assert.equal(calls,1);
  await stop();request=await start();project=await(await request('/api/project',{path:repo})).json();
  const cached=(await(await request('/api/explain',input)).text()).trim().split('\n').map(JSON.parse).find(e=>e.type==='answer');assert.equal(cached.cached,true);assert.equal(cached.depth,'syntax');assert.equal(calls,1);
  let library=await(await request('/api/answers')).json();assert.equal(library.answers.length,1);assert.equal(library.answers[0].depth,'syntax');
  await writeFile(path.join(repo,'main.ts'),'export function validate(value: string){return value.toUpperCase();}');
  assert.equal((await request('/api/explain',input)).status,409);
  project=await(await request('/api/refresh',{})).json();
  await(await request('/api/explain',{...input,revision:project.revision})).text();assert.equal(calls,2);
  library=await(await request('/api/answers')).json();assert.equal(library.answers.length,2);
  assert.equal((await request('/api/explain',{...input,revision:project.revision,learning:'invalid'})).status,400);
  await request('/api/answers',null,'DELETE');assert.equal((await(await request('/api/answers')).json()).answers.length,0);
 }finally{if(server?.listening)await stop();await rm(root,{recursive:true,force:true});}
});

test('recommendations compare indexed excerpts, include tests, and reject invalid comparison locations',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'atlas-recommend-'));
 await writeFile(path.join(root,'main.ts'),'export function normalize(x: string){return x.trim();}');
 await writeFile(path.join(root,'copy.ts'),'// comparison-only-marker\nexport function cleanup(x: string){return x.trim();}');
 await writeFile(path.join(root,'main.test.ts'),'import {normalize} from "./main";\nexport function check(){return normalize("recommend-test-marker");}');
 let prompt='',calls=0;
 const server=createServer({explain:async text=>{prompt=text;calls++;return JSON.stringify({summary:'Check the shared rule.',claims:[],findings:[],recommendations:[{title:'Share normalization',category:'duplication',priority:'low',confidence:'medium',reason:'Same trimming rule.',change:'Use one helper.',benefit:'Consistent rule.',tradeoff:'Adds coupling.',evidence:[{path:'main.ts',line:1},{path:'copy.ts',line:2}],verification:['Test whitespace.']}]});}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`,{token}=await(await fetch(base+'/api/session')).json();
 const request=(url,data)=>fetch(base+url,{method:data?'POST':'GET',headers:{'X-Atlas-Token':token,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
 const project=await(await request('/api/project',{path:root})).json();
 const input={mode:'recommend',file:'main.ts',revision:project.revision,question:'',history:[],structured:true,comparison:{path:'copy.ts',line:2}};
 const res=await request('/api/explain',input);assert.equal(res.status,200);
 const answer=(await res.text()).trim().split('\n').map(JSON.parse).find(e=>e.type==='answer');
 assert.equal(answer?.coaching.recommendations.length,1);assert.match(prompt,/comparison-only-marker/);assert.match(prompt,/recommend-test-marker/);
 assert.deepEqual(answer.comparison,input.comparison);
 for(const comparison of [{path:'../outside.ts',line:1},{path:'copy.ts',line:999},{path:'copy.ts',line:1.5},'copy.ts'])assert.equal((await request('/api/explain',{...input,comparison})).status,400);
 assert.equal(calls,1);
 const cached=(await(await request('/api/explain',input)).text()).trim().split('\n').map(JSON.parse).find(e=>e.type==='answer');assert.equal(cached.cached,true);
});
