import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

const bundle=(await build({entryPoints:['src/app.js'],bundle:true,write:false,format:'iife'})).outputFiles[0].text;
const pause=()=>new Promise(resolve=>setTimeout(resolve,20));
async function setup(t,{available=true,choose=async()=>Response.json({path:'/test/my project',cancelled:false})}={}){
  const dom=new JSDOM('<div id="app"></div><div id="toast"></div><dialog id="folder-dialog"></dialog>',{url:'http://localhost:4317',runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  const w=dom.window,opened=[],picks=[];
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.AbortController=AbortController;
  w.fetch=async(url,options={})=>{
    if(url==='/api/folder-picker'){picks.push(options);return choose(options);}
    if(url==='/api/project'&&options.method==='POST'){
      opened.push(JSON.parse(options.body));
      return Response.json({id:'test',revision:'r1',name:'Selected project',files:[],symbols:[],entries:[],packages:[],frameworks:[],imports:[],calls:[],stats:{}});
    }
    if(url.startsWith('/api/browse'))return Response.json({path:'/test',parent:'/',folders:[]});
    return Response.json(url==='/api/session'?{token:'test',nativeFolderPicker:available}:url==='/api/status'?{connected:true}:url==='/api/project'?null:{});
  };
  w.eval(bundle);await pause();w.document.querySelector('#welcome-open').click();await pause();
  return {w,opened,picks,button:()=>w.document.querySelector('#choose-native-folder')};
}

test('Choose in Finder opens the selected project and suppresses repeated clicks',async t=>{
  let finish;
  const {w,opened,picks,button}=await setup(t,{choose:()=>new Promise(resolve=>{finish=resolve;})});
  assert.ok(button(),'native chooser is offered');button().click();button().click();
  assert.equal(button().disabled,true);assert.equal(picks.length,1);
  finish(Response.json({path:'/test/my project',cancelled:false}));await pause();
  assert.deepEqual(opened,[{path:'/test/my project'}]);
  assert.equal(w.document.querySelector('#folder-dialog').open,false);
  assert.equal(w.document.querySelector('#project-name').textContent,'Selected project');
});

test('cancelling native selection keeps the browser picker and current project untouched',async t=>{
  const {w,opened,button}=await setup(t,{choose:async()=>Response.json({path:null,cancelled:true})});
  button().click();await pause();assert.equal(opened.length,0);
  assert.equal(w.document.querySelector('#folder-dialog').open,true);assert.equal(button().disabled,false);
});

test('native failure leaves manual folder selection usable',async t=>{
  const {w,opened,button}=await setup(t,{choose:async()=>Response.json({error:'Use the folder list instead.'},{status:400})});
  button().click();await pause();assert.match(w.document.querySelector('#folder-dialog').textContent,/Use the folder list/);
  assert.equal(button().disabled,false);
  w.document.querySelector('#folder-path').value='/test/manual';
  w.document.querySelector('#path-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await pause();
  assert.deepEqual(opened,[{path:'/test/manual'}]);
});

test('closing the browser picker aborts native selection and ignores a late result',async t=>{
  let finish;
  const {w,opened,picks,button}=await setup(t,{choose:()=>new Promise(resolve=>{finish=resolve;})});
  button().click();w.document.querySelector('#close-dialog').click();
  assert.equal(picks[0].signal.aborted,true);
  w.document.querySelector('#welcome-open').click();await pause();
  finish(Response.json({path:'/test/late',cancelled:false}));await pause();
  assert.equal(opened.length,0);assert.equal(w.document.querySelector('#folder-dialog').open,true);
});

test('other hosts can still open projects through the existing folder list',async t=>{
  const {w,opened,button}=await setup(t,{available:false});assert.equal(button(),null);
  w.document.querySelector('#select-folder').click();await pause();assert.deepEqual(opened,[{path:'/test'}]);
});
