import test from 'node:test';import assert from 'node:assert/strict';
import * as exploration from '../server/exploration.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {scanProject} from '../server/project.mjs';
const p={files:[{path:'app.ts',lines:20,role:'source'},{path:'save.ts',lines:10,role:'source'}],symbols:[{id:'a',name:'submit',path:'app.ts',line:2,end:9},{id:'b',name:'save',path:'save.ts',line:1,end:5}],calls:[{from:'a',to:'b',line:3,kind:'calls'},{from:'b',to:'a',line:4,kind:'calls'}],imports:[{from:'app.ts',to:'save.ts',line:1}],boundaries:[{path:'save.ts',line:3,name:'db.insert',from:'b'}]};
test('journeys keep cycle-free grounded relationships and external boundaries',()=>{const j=exploration.buildJourney(p,'app.ts','a');assert.deepEqual(j.stops.map(s=>s.path),['app.ts','save.ts']);assert.equal(j.stops[1].via,'calls');assert.equal(j.boundaries[0].name,'db.insert');});
test('AI citation validation rejects nonexistent and unsupplied source ranges',()=>{const result=exploration.validateEvidence('[valid](atlas://file?path=app.ts&line=3) [invented](atlas://file?path=app.ts&line=19) [outside](atlas://file?path=secret.ts&line=1)',[{path:'app.ts',start:2,end:9}]);assert.equal(result.valid,1);assert.equal(result.invalid,2);assert(!result.text.includes('path=secret.ts'));assert(!result.text.includes('line=19'));});
test('diff evidence anchors only lines that match the displayed current source',()=>{const diff='@@ -10,2 +10,2 @@\n unchanged\n-old\n+new';const current=Array(9).fill('padding').concat(['unchanged','new']).join('\n');assert.deepEqual(exploration.diffEvidence('a.ts',diff,current),[{path:'a.ts',start:10,end:11}]);assert.deepEqual(exploration.diffEvidence('a.ts',diff,current.replace('new','newer')),[{path:'a.ts',start:10,end:10}]);});
test('text search excludes source changed since the indexed revision',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'atlas-search-'));
 try{await writeFile(path.join(root,'source.ts'),'export const value = "original";');const project=await scanProject(root);
 await writeFile(path.join(root,'source.ts'),'export const value = "new-marker";');
 const result=await exploration.searchProject(project,'new-marker','text');
 assert.deepEqual(result.results,[]);assert.equal(result.limited,true);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('file search reports when matching paths exceed its result limit',async()=>{
 const project={files:Array.from({length:81},(_,i)=>({path:`match-${i}.ts`,role:'source'}))};
 const result=await exploration.searchProject(project,'match','files');
 assert.equal(result.results.length,80);assert.equal(result.limited,true);
});
