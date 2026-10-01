import http from 'node:http';
import { readFile, readdir, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readProjectFile, digest } from './project.mjs';
import { loginStatus, startLogin, explainWithCodex, buildPrompt } from './codex.mjs';
import { indexProject } from './indexer.mjs';
import { buildJourney, searchProject } from './exploration.mjs';
import { listChanges, fileDiff } from './git.mjs';
import { createAnswerStore } from './answer-store.mjs';
import { discoverFeature, discoverTestEvidence } from './feature-map.mjs';
import { parseCoaching } from './coaching.mjs';
import { getThemes } from './themes.mjs';
import { prepareExplanationContext, assertExplanationCurrent, listAnswersWithFreshness, changedFiles } from './dependency-cache.mjs';

const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const publicDir=path.join(base,'public');
const MAX_BODY=256000;

export function createServer({explain=explainWithCodex,cacheDirectory=null}={}) {
  const token=randomBytes(32).toString('hex');
  let project=null,busy=false,indexing=false;
  const cache=createAnswerStore({directory:cacheDirectory});
  const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  async function body(req) {
    let text='';
    for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>MAX_BODY)throw new Error('Request is too large.');}
    try{return JSON.parse(text||'{}');}catch{throw new Error('Invalid request.');}
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const port=server.address()?.port;
    const hosts=[`127.0.0.1:${port}`,`localhost:${port}`];
    if(!hosts.includes(req.headers.host)|| (req.headers.origin&&!hosts.some(h=>req.headers.origin===`http://${h}`))) return send(res,403,{error:'Only the local Code Atlas window can access this app.'});
    const url=new URL(req.url,`http://${req.headers.host}`);
    try {
      if(url.pathname==='/api/session'&&req.method==='GET')return send(res,200,{token});
      if(url.pathname.startsWith('/api/')) {
        const supplied=req.headers['x-atlas-token'];
        if(typeof supplied!=='string'||!/^[a-f0-9]{64}$/.test(supplied)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(token)))return send(res,403,{error:'Refresh the app to reconnect your local session.'});
        if(url.pathname==='/api/status'&&req.method==='GET')return send(res,200,await loginStatus());
        if(url.pathname==='/api/themes'&&req.method==='GET')return send(res,200,await getThemes());
        if(url.pathname==='/api/login'&&req.method==='POST')return send(res,200,startLogin());
        if(url.pathname==='/api/browse'&&req.method==='GET') {
          const dir=await realpath(url.searchParams.get('dir')||os.homedir());
          const entries=await readdir(dir,{withFileTypes:true});
          return send(res,200,{path:dir,parent:path.dirname(dir),folders:entries.filter(e=>e.isDirectory()&&!e.name.startsWith('.')&&!['node_modules','Library'].includes(e.name)).map(e=>({name:e.name,path:path.join(dir,e.name)})).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,150)});
        }
        if(url.pathname==='/api/project'&&req.method==='POST') {
          if(busy||indexing)return send(res,409,{error:'Wait for the current operation before opening another project.'});
          const input=await body(req);
          if(!input.demo && (typeof input.path!=='string'||!input.path.trim()))throw new Error('Enter a project folder path.');
          if(busy||indexing)return send(res,409,{error:'Wait for the current operation before opening another project.'});
          indexing=true;try{project=await indexProject(input.demo?path.join(base,'examples/tiny-tasks'):input.path);}finally{indexing=false;}
          return send(res,200,project);
        }
        if(url.pathname==='/api/project'&&req.method==='GET')return send(res,200,project);
        if(!project)return send(res,400,{error:'Open a project first.'});
        if(url.pathname==='/api/refresh'&&req.method==='POST') {if(busy||indexing)return send(res,409,{error:'Wait for the current operation before refreshing.'});indexing=true;try{project=await indexProject(project.root);}finally{indexing=false;}return send(res,200,project);}
        if(url.pathname==='/api/answers'&&req.method==='GET'){const snapshot=project;return send(res,200,{answers:await listAnswersWithFreshness(await cache.list(snapshot.id),snapshot)});}
        if(url.pathname==='/api/answers'&&req.method==='DELETE'){if(busy)return send(res,409,{error:'Stop the current explanation before clearing saved answers.'});return send(res,200,{removed:await cache.clear(project.id)});}
        if(url.pathname==='/api/feature'&&req.method==='GET')return send(res,200,await discoverFeature(project,url.searchParams.get('q')||''));
        if(url.pathname==='/api/test-evidence'&&req.method==='GET')return send(res,200,await discoverTestEvidence(project,url.searchParams.get('file'),url.searchParams.get('selection')||''));
        if(url.pathname==='/api/journey'&&req.method==='GET'){const file=url.searchParams.get('file'),selection=url.searchParams.get('selection');if(!project.files.some(f=>f.path===file))throw new Error('Choose a readable source file.');if(selection&&!project.symbols.some(s=>s.id===selection&&s.path===file))throw new Error('Choose a symbol from the selected file.');return send(res,200,buildJourney(project,file,selection));}
        if(url.pathname==='/api/search'&&req.method==='GET')return send(res,200,await searchProject(project,url.searchParams.get('q')||'',url.searchParams.get('kind')||'symbols'));
        if(url.pathname==='/api/changes'&&req.method==='GET')return send(res,200,await listChanges(project,url.searchParams.get('scope')||'working'));
        if(url.pathname==='/api/diff'&&req.method==='GET')return send(res,200,await fileDiff(project,url.searchParams.get('file'),url.searchParams.get('scope')||'working'));
        if(url.pathname==='/api/freshness'&&req.method==='GET'){const snapshot=project,fresh=await indexProject(snapshot.root,{snapshot:true});return send(res,200,{stale:fresh.revision!==snapshot.revision,changedFiles:changedFiles(snapshot,fresh)});}
        if(url.pathname==='/api/file'&&req.method==='GET') {
          const file=await readProjectFile(project,url.searchParams.get('path'));
          return send(res,200,{...file,stale:file.hash!==project.files.find(f=>f.path===file.path)?.hash});
        }
        if(url.pathname==='/api/explain'&&req.method==='POST') {
          if(busy||indexing)return send(res,409,{error:'Codex is finishing the previous request. Please try again in a moment.'});
          const input=await body(req);
          if(busy||indexing)return send(res,409,{error:'Codex is finishing the previous request. Please try again in a moment.'});
          if(!['explain','overview','review','flow','practice','verify','teachback','recommend'].includes(input.mode))throw new Error('Choose a supported explanation mode.');
          for(const field of ['learning','verification','feature'])if(input[field]!=null&&(typeof input[field]!=='object'||Array.isArray(input[field])))throw new Error('Invalid '+field+' context.');
          if(input.structured!==undefined&&typeof input.structured!=='boolean')throw new Error('Invalid response format.');
          const snapshot=project;
          if(input.revision!==snapshot.revision)return send(res,409,{error:'The project has changed. Refresh the index first.'});
          if(input.file && !snapshot.files.some(f=>f.path===input.file))throw new Error('Choose a readable project file.');
          if(input.mode==='recommend'&&!input.file)throw new Error('Choose a source file for recommendations.');
          if(input.comparison!=null){const c=input.comparison,f=snapshot.files.find(f=>f.path===c?.path);if(typeof c!=='object'||Array.isArray(c)||!f||!Number.isInteger(c.line)||c.line<1||c.line>f.lines)throw new Error('Choose an indexed comparison file and a valid line.');}
          if(input.selection&&!snapshot.symbols.some(s=>s.id===input.selection&&s.path===input.file))throw new Error('Choose a symbol from the selected file.');
          if(input.range){const f=snapshot.files.find(f=>f.path===input.file);if(!f||!Number.isInteger(input.range.start)||!Number.isInteger(input.range.end)||input.range.start<1||input.range.end<input.range.start||input.range.end>f.lines||input.range.end-input.range.start>300)throw new Error('Select up to 301 valid source lines.');}
          if(input.depth&&!['brief','normal','syntax'].includes(input.depth))throw new Error('Choose a supported explanation depth.');
          if(typeof input.question!=='string'||input.question.length>6000)throw new Error('Keep the question under 6,000 characters.');
          if(!Array.isArray(input.history)||input.history.length>6||input.history.some(m=>typeof m.text!=='string'||m.text.length>4000||!['user','assistant'].includes(m.role)))throw new Error('Invalid conversation context.');
          const controller=new AbortController();
          res.on('close',()=>controller.abort());
          busy=true;
          try {
            const {bundle,dependencies,verification,feature}=await prepareExplanationContext(snapshot,input);
            const assertCurrent=()=>assertExplanationCurrent(snapshot,dependencies);
            await assertCurrent();
            const prompt=buildPrompt({...input,verification,feature,context:bundle.text});
            const key=digest('workbench-v2:'+snapshot.id+':'+dependencies.fingerprint+':'+prompt);
            res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Accel-Buffering':'no'});
            const event=data=>{if(!res.destroyed)res.write(JSON.stringify(data)+'\n');};
            const saved=await cache.get(key);
            if(saved&&saved.projectId===snapshot.id&&saved.dependencies?.fingerprint===dependencies.fingerprint){await assertCurrent();event({type:'answer',...saved,freshness:'current',staleDependencies:[],cached:true});res.end();return;}
            event({type:'progress',text:'Connecting to your signed-in Codex…'});
            const answer=await explain(prompt,{signal:controller.signal,onProgress:text=>event({type:'progress',text})});
            if(controller.signal.aborted)return;
            await assertCurrent();
            const checked=parseCoaching(answer,bundle.evidence);
            const result={...checked,evidence:bundle.evidence,dependencies,freshness:'current',staleDependencies:[],revision:snapshot.revision,projectId:snapshot.id,file:input.file||'',mode:input.mode,depth:input.depth||'normal',selection:input.selection||'',range:input.range||null,comparison:input.mode==='recommend'?input.comparison||null:null,createdAt:new Date().toISOString()};
            try{await cache.set(key,result);}catch{result.cacheWarning='The explanation is ready, but it could not be saved on this computer.';}
            await assertCurrent();
            event({type:'answer',...result,cached:false});res.end();
          } catch(error) {
            if(!res.headersSent)send(res,/source.*chang|refresh.*index/i.test(error.message)?409:400,{error:error.message});
            else if(!res.destroyed){res.write(JSON.stringify({type:'error',text:error.message})+'\n');res.end();}
          } finally {busy=false;}
          return;
        }
        return send(res,404,{error:'This action is not available.'});
      }
      const assets={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css'],'/favicon.svg':['favicon.svg','image/svg+xml']};
      const asset=assets[url.pathname];
      if(!asset||req.method!=='GET')return send(res,404,{error:'Not found.'});
      const content=await readFile(path.join(publicDir,asset[0]));
      res.writeHead(200,{'Content-Type':asset[1],'Cache-Control':'no-cache'});res.end(content);
    } catch(error){if(!res.headersSent)send(res,400,{error:error.code==='ENOENT'?'That folder or file could not be found.':error.message});else res.end();}
  });
  return server;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const server=createServer({cacheDirectory:process.env.CODE_ATLAS_CACHE_DIR||path.join(os.homedir(),'.code-atlas','answers')}),port=Number(process.env.PORT||4317);
  server.listen(port,'127.0.0.1',()=>console.log(`Code Atlas is ready at http://127.0.0.1:${server.address().port}`));
  server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`Port ${port} is in use. Set PORT to another number.`:e.message);process.exitCode=1;});
}
