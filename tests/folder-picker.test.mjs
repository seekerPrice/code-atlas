import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer} from '../server/index.mjs';

async function serve(t, folderPicker) {
  const server=createServer({folderPicker});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const base=`http://127.0.0.1:${server.address().port}`;
  const session=await (await fetch(base+'/api/session')).json();
  const headers={'X-Atlas-Token':session.token,'Content-Type':'application/json'};
  return {base,session,headers,pick:()=>fetch(base+'/api/folder-picker',{method:'POST',headers,body:'{}'})};
}

test('only an authenticated local POST can open the native folder picker',async t=>{
  let calls=0;
  const {base,session,headers,pick}=await serve(t,{available:true,choose:async()=>{calls++;return '/test/project';}});
  assert.equal(session.nativeFolderPicker,true);
  assert.equal((await fetch(base+'/api/folder-picker',{method:'POST'})).status,403);
  assert.equal((await fetch(base+'/api/folder-picker',{method:'POST',headers:{...headers,Origin:'https://example.com'}})).status,403);
  assert.notEqual((await fetch(base+'/api/folder-picker',{headers})).status,200);
  assert.equal(calls,0);
  const selected=await pick();
  assert.equal(selected.status,200);
  assert.deepEqual(await selected.json(),{path:'/test/project',cancelled:false});
  assert.equal(calls,1);
  assert.equal(await (await fetch(base+'/api/project',{headers})).json(),null,'selection alone does not replace a project');
});

test('native selection allows cancellation, rejects duplicate dialogs and releases its lock',async t=>{
  let finish,entered;
  const opened=new Promise(resolve=>{entered=resolve;});
  const {pick}=await serve(t,{available:true,choose:()=>{entered();return new Promise(resolve=>{finish=resolve;});}});
  const first=pick();await opened;
  assert.equal((await pick()).status,409);
  finish(null);
  assert.deepEqual(await (await first).json(),{path:null,cancelled:true});
});

test('unsupported hosts keep native selection unavailable',async t=>{
  const {session,pick}=await serve(t,{available:false,choose:()=>assert.fail('must not launch')});
  assert.equal(session.nativeFolderPicker,false);
  assert.equal((await pick()).status,501);
});

test('disconnecting a picker request aborts the native process and allows retry',async t=>{
  let entered,aborted;
  const opened=new Promise(resolve=>{entered=resolve;});
  const stopped=new Promise(resolve=>{aborted=resolve;});
  let calls=0;
  const {base,headers,pick}=await serve(t,{available:true,choose:({signal})=>{
    if(++calls>1)return null;
    entered();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted();reject(new Error('closed'));},{once:true}));
  }});
  const controller=new AbortController();
  const request=fetch(base+'/api/folder-picker',{method:'POST',headers,body:'{}',signal:controller.signal});
  await opened;controller.abort();
  await assert.rejects(request,{name:'AbortError'});await stopped;
  assert.equal((await pick()).status,200);
});

test('native adapter preserves spaces and quotes in a selected folder path',async t=>{
  const {chooseNativeFolder}=await import('../server/folder-picker.mjs');
  const folder=await mkdtemp(path.join(os.tmpdir(),"atlas picker ' "));
  t.after(()=>rm(folder,{recursive:true,force:true}));
  assert.equal(await chooseNativeFolder({platform:'darwin',run:async()=>({stdout:folder+'\n'})}),folder);
  assert.equal(await chooseNativeFolder({platform:'darwin',run:async()=>({stdout:'\n'})}),null);
});

test('native adapter rejects unsupported platforms and reports launch failures with a usable fallback',async()=>{
  const {chooseNativeFolder}=await import('../server/folder-picker.mjs');
  await assert.rejects(chooseNativeFolder({platform:'linux',run:()=>assert.fail('must not launch')}),/macOS/);
  await assert.rejects(chooseNativeFolder({platform:'darwin',run:async()=>{throw new Error('launch failed');}}),/folder list|folder path/);
});
