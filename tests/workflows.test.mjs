import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from '../server/index.mjs';
test('reading API validates range, resolves journeys and rejects fabricated evidence',async()=>{let prompt='';const server=createServer({explain:async p=>{prompt=p;return '[real](atlas://file?path=lib/validation.ts&line=2) [fake](atlas://file?path=lib/validation.ts&line=900)';}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;try{const {token}=await (await fetch(base+'/api/session')).json();const headers={'X-Atlas-Token':token,'Content-Type':'application/json'};const request=(url,data)=>fetch(base+url,{headers,...(data?{method:'POST',body:JSON.stringify(data)}:{})});const project=await(await request('/api/project',{demo:true})).json();
 const journey=await request('/api/journey?file=app%2Fapi%2Ftasks%2Froute.ts');assert.equal(journey.status,200);assert((await journey.json()).stops.length>1);
 const unrelated=project.symbols.find(s=>s.path==='lib/validation.ts');
 assert.equal((await request('/api/journey?file=app%2Fapi%2Ftasks%2Froute.ts&selection='+encodeURIComponent(unrelated.id))).status,400);
 const search=await(await request('/api/search?q=validateTitle&kind=symbols')).json();assert.equal(search.results[0].label,'validateTitle');
 const input={revision:project.revision,mode:'explain',file:'lib/validation.ts',selection:'',question:'',history:[],range:{start:2,end:3},depth:'syntax'};
 assert.equal((await request('/api/explain',{...input,range:{start:100,end:101}})).status,400);
 assert.equal((await request('/api/explain',{...input,selection:'made-up'})).status,400);
 const res=await request('/api/explain',input);assert.equal(res.status,200);const events=(await res.text()).trim().split('\n').map(l=>JSON.parse(l));const answer=events.find(e=>e.type==='answer');assert.equal(answer.citations.invalid,1);assert(!answer.text.includes('line=900'));assert.match(prompt,/syntax/i);
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}});

test('source changes during an AI request prevent a stale answer from being displayed',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');const os=await import('node:os');const path=await import('node:path');const root=await mkdtemp(path.join(os.tmpdir(),'atlas-stale-'));await writeFile(path.join(root,'main.ts'),'export const n = 1;');
 const server=createServer({explain:async()=>{await writeFile(path.join(root,'main.ts'),'export const n = 2;');return 'Old explanation';}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{const {token}=await(await fetch(base+'/api/session')).json();const headers={'X-Atlas-Token':token,'Content-Type':'application/json'};const p=await(await fetch(base+'/api/project',{method:'POST',headers,body:JSON.stringify({path:root})})).json();const response=await fetch(base+'/api/explain',{method:'POST',headers,body:JSON.stringify({revision:p.revision,mode:'explain',file:'main.ts',question:'',history:[]})});const events=(await response.text()).trim().split('\n').map(JSON.parse);assert(!events.some(e=>e.type==='answer'));assert(events.some(e=>e.type==='error'&&/changed/.test(e.text)));
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});}
});
