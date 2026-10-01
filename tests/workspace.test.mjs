import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {scanProject,projectContext} from '../server/project.mjs';

async function fixture(files,fn){const root=await mkdtemp(path.join(os.tmpdir(),'atlas-workspace-'));try{for(const [p,text]of Object.entries(files)){await mkdir(path.dirname(path.join(root,p)),{recursive:true});await writeFile(path.join(root,p),text);}await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
const files={
 'package.json':'{"name":"workspace"}',
 'apps/web/package.json':'{"name":"web","dependencies":{"next":"catalog:"}}',
 'apps/web/tsconfig.json':'{"compilerOptions":{"paths":{"@/*":["./*"]}}}',
 'apps/web/lib/validate.ts':'export function validate(x: string) { return x.trim(); }',
 'apps/web/app/page.tsx':'export default function Home() { return null; }',
 'apps/web/app/api/tasks/route.ts':"import {validate} from '@/lib/validate';\nimport {save} from '@demo/core';\nexport function POST(){return save(validate('hello'));}",
 'packages/core/package.json':'{"name":"@demo/core","exports":{".":{"types":"./src/index.ts"}}}',
 'packages/core/src/index.ts':"export {save} from './save';",
 'packages/core/src/save.ts':'export function save(x: string) { return x; }',
 'apps/web/.gitignore':'local/\n*.private.ts\n!keep.private.ts\n',
 'apps/web/local/data.ts':'const excluded = true;',
 'apps/web/test.private.ts':'const excluded = true;',
 'apps/web/keep.private.ts':'const keep = true;'
};
test('monorepo navigation follows tsconfig aliases and workspace barrel exports',()=>fixture(files,async root=>{
 const p=await scanProject(root);assert(p.frameworks.includes('next'));
 const handler=p.symbols.find(s=>s.name==='POST');
 const targets=p.calls.filter(c=>c.from===handler.id).map(c=>p.symbols.find(s=>s.id===c.to)?.name);
 assert.deepEqual(targets.sort(),['save','validate']);
 assert(p.imports.some(i=>i.specifier==='@/lib/validate'&&i.to==='apps/web/lib/validate.ts'));
 assert.equal(p.entries[0].path,'apps/web/app/page.tsx');
 assert(p.packages.some(x=>x.name==='@demo/core'));
}));
test('function links identify the exact call token, including aliases and methods',()=>fixture({
 'helper.ts':'export function work(){return 1;}\nexport class Worker { run(){return 2;} }',
 'main.ts':"import {work as renamed, Worker} from './helper';\nfunction main(){ const w = new Worker(); return renamed() + w.run(); }"
},async root=>{
 const p=await scanProject(root),main=p.symbols.find(s=>s.name==='main');
 const edges=p.calls.filter(c=>c.from===main.id);
 assert.equal(edges.length,3);
 const line='function main(){ const w = new Worker(); return renamed() + w.run(); }';
 assert.deepEqual(edges.map(c=>({name:p.symbols.find(s=>s.id===c.to).name,token:c.reference&&line.slice(c.reference.start,c.reference.end),line:c.reference?.line})),[
  {name:'Worker',token:'Worker',line:2},{name:'work',token:'renamed',line:2},{name:'run',token:'run',line:2}
 ]);
}));
test('nested ignore rules protect local files while honoring negations',()=>fixture(files,async root=>{
 const p=await scanProject(root);assert(!p.files.some(f=>f.path==='apps/web/local/data.ts'));assert(!p.files.some(f=>f.path==='apps/web/test.private.ts'));assert(p.files.some(f=>f.path==='apps/web/keep.private.ts'));
}));
test('a selected function near the end of a long file reaches the AI context',()=>fixture({'large.ts':Array.from({length:1600},()=> '// harmless padding for context').join('\n')+'\nexport function tailFeature(){return "unique-tail-evidence";}\n'},async root=>{
 const p=await scanProject(root);const s=p.symbols.find(s=>s.name==='tailFeature');const c=await projectContext(p,'large.ts',s.id);assert(c.includes('unique-tail-evidence'));assert(c.includes('1601:'));
}));
test('a repo above 1000 files includes late shared packages',()=>fixture({...Object.fromEntries(Array.from({length:1002},(_,i)=>[`a/${i}.md`,'notes'])),'z/core.ts':'export function reached(){return 1;}'},async root=>{
 const p=await scanProject(root);assert(p.files.some(f=>f.path==='z/core.ts'));assert.equal(p.limited,false);
}));
test('CSS imports stay navigable without being parsed as TypeScript',()=>fixture({'page.tsx':"import './style.css'; export function Page(){return null;}",'style.css':'body{color:red;}'},async root=>{const p=await scanProject(root);assert.equal(p.imports[0].to,'style.css');}));
test('selected-function evidence includes nearby constants and same-file helpers',()=>fixture({'feature.ts':"const LIMIT = 3;\nfunction refuse(){return 'no';}\n"+Array.from({length:100},()=> '// padding').join('\n')+"\nexport function feature(n:number){return n>LIMIT?refuse():'ok';}\n"},async root=>{const p=await scanProject(root),s=p.symbols.find(s=>s.name==='feature');const context=await projectContext(p,'feature.ts',s.id);assert(context.includes('const LIMIT = 3'));assert(context.includes("function refuse(){return 'no';}"));}));
