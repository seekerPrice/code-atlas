import {realpath} from 'node:fs/promises';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import path from 'node:path';
import {readablePath,readProjectFile,digest} from './project.mjs';
const exec=promisify(execFile);
export async function readGit(project,args){
 const options={cwd:project.root,env:{PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8',GIT_OPTIONAL_LOCKS:'0',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'},timeout:15000,maxBuffer:4*1024*1024};
 // Worktree diffs can invoke clean/process filters even with --no-textconv.
 // Read their names as inert config data, then disable each driver for this command.
 let keys='';try{keys=(await exec('git',['config','-z','--name-only','--get-regexp','^filter\\..*\\.(clean|smudge|process|required)$'],options)).stdout;}catch(e){if(e.code!==1)throw e;}
 const drivers=[...new Set(keys.split('\0').filter(Boolean).map(k=>k.slice(0,k.lastIndexOf('.'))))];
 const disabled=drivers.flatMap(k=>['-c',k+'.clean=','-c',k+'.smudge=','-c',k+'.process=','-c',k+'.required=false']);
 return (await exec('git',['--no-pager',...(args[0]==='check-ignore'?[]:['--literal-pathspecs']),'-c','core.fsmonitor=false',...disabled,...args],options)).stdout;
}
const argsFor=scope=>{if(!['working','staged','unstaged'].includes(scope))throw new Error('Choose a supported change scope.');return scope==='working'?['HEAD']:scope==='staged'?['--cached']:[];};
export async function listChanges(project,scope='working'){
 const scopeArgs=argsFor(scope);let raw;
 try{const top=(await readGit(project,['rev-parse','--show-toplevel'])).trim();if(await realpath(top)!==project.root)return {available:false,files:[],reason:'Open the Git repository root to review changes.'};await readGit(project,['rev-parse','--verify','HEAD']);raw=await readGit(project,['diff','--no-ext-diff','--no-textconv','--no-renames','--name-status','-z',...scopeArgs,'--']);}
 catch{return {available:false,files:[],reason:'No Git history available. Source reading still works.'};}
 const parts=raw.split('\0'),files=[];for(let i=0;i+1<parts.length;i+=2){const status=parts[i],p=parts[i+1];if(!readablePath(p))continue;
  if(project.files.some(f=>f.path===p))files.push({path:p,status});
  else if(status==='D'){try{await readGit(project,['check-ignore','--no-index','--',p]);}catch(e){if(e.code===1)files.push({path:p,status});}}
 }
 if(scope!=='staged'){const untracked=(await readGit(project,['ls-files','--others','--exclude-standard','-z'])).split('\0');for(const p of untracked)if(project.files.some(f=>f.path===p))files.push({path:p,status:'?'});}
 return {available:true,scope,files:files.slice(0,300),limited:files.length>300};
}
export async function fileDiff(project,file,scope='working'){
 const changes=await listChanges(project,scope),item=changes.files.find(f=>f.path===file);if(!item)throw new Error('Choose a readable changed file.');let text;
 if(item.status==='?'){const data=await readProjectFile(project,file);text=`--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${data.content.split('\n').length} @@\n`+data.content.split('\n').map(l=>'+'+l).join('\n');}
 else text=await readGit(project,['diff','--no-ext-diff','--no-textconv','--no-renames','--no-color','--unified=5',...argsFor(scope),'--',file]);
 const limited=text.length>80000;text=text.slice(0,80000);return {...item,scope,text,hash:digest(text),limited};
}
