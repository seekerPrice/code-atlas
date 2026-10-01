import {readProjectFile} from './project.mjs';
export function buildJourney(project,file,selection){
 const symbols=new Map(project.symbols.map(s=>[s.id,s])),stops=[],visited=new Set(),queue=[];
 const start=selection&&symbols.get(selection)||project.symbols.find(s=>s.path===file);
 queue.push({path:file,symbol:start?.id,line:start?.line||1,via:'start',reason:'Identify the input, output, and responsibility.'});
 while(queue.length&&stops.length<8){const current=queue.shift(),key=current.symbol||current.path;if(visited.has(key))continue;visited.add(key);stops.push(current);
  const edges=current.symbol?project.calls.filter(c=>c.from===current.symbol):[];
  for(const edge of edges){const target=symbols.get(edge.to);if(target)queue.push({path:target.path,symbol:target.id,line:target.line,name:target.name,via:edge.kind||'calls',from:current.path,at:edge.line,reason:`${symbols.get(current.symbol)?.name||'Source'} ${edge.kind||'calls'} ${target.name}. Inspect its contract and failure cases.`});}
  if(!edges.length)for(const dep of project.imports.filter(i=>i.from===current.path&&i.to).slice(0,4))queue.push({path:dep.to,line:1,via:dep.kind||'import',from:current.path,at:dep.line,reason:'Imported code supplies context; this is not proof of an execution step.'});
 }
 const paths=new Set(stops.map(s=>s.path));return {stops,boundaries:(project.boundaries||[]).filter(b=>paths.has(b.path)).slice(0,15),limited:queue.length>0,label:'Static reading path — order is a reading suggestion, not runtime execution'};
}
export function validateEvidence(text,evidence){let valid=0,invalid=0;const cleaned=text.replace(/\[([^\]]*)\]\((atlas:[^\s)]*)\)/g,(all,label,href)=>{try{const u=new URL(href),p=u.searchParams.get('path'),n=Number(u.searchParams.get('line'));if(u.hostname==='file'&&Number.isInteger(n)&&evidence.some(e=>e.path===p&&n>=e.start&&n<=e.end)){valid++;return all;}}catch{}invalid++;return `${label} (unverified source reference)`;});return {text:cleaned,valid,invalid};}
export async function searchProject(project,query,kind='symbols'){
 const q=query.trim().toLowerCase();if(!q)return {results:[],limited:false};
 if(q.length>120)throw new Error('Keep searches under 120 characters.');
 if(kind==='files'){const matched=project.files.filter(f=>f.path.toLowerCase().includes(q));return {results:matched.slice(0,80).map(f=>({path:f.path,line:1,label:f.path,kind:f.role})),limited:matched.length>80};}
 if(kind==='symbols'){const matched=project.symbols.filter(s=>(s.name+' '+s.path).toLowerCase().includes(q));return {results:matched.sort((a,b)=>(a.name.toLowerCase()===q?-1:0)-(b.name.toLowerCase()===q?-1:0)).slice(0,80).map(s=>({...s,label:s.name,symbol:s.id})),limited:matched.length>80};}
 if(kind!=='text')throw new Error('Choose a supported search type.');
 const results=[];let searched=0,limited=false;
 for(const f of project.files){if(results.length>=80)break;try{const {content,hash}=await readProjectFile(project,f.path);searched++;if(hash!==f.hash){limited=true;continue;}const lines=content.split('\n');for(let i=0;i<lines.length&&results.length<80;i++)if(lines[i].toLowerCase().includes(q))results.push({path:f.path,line:i+1,label:lines[i].trim().slice(0,180),kind:'text'});}catch{limited=true;}}
 return {results,limited:limited||searched<project.files.length};
}
export function diffEvidence(file,diff,content){const lines=content.split('\n'),evidence=[];let n=0;for(const line of diff.split('\n')){const h=line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);if(h){n=Number(h[1]);continue;}if(!n||(!line.startsWith(' ')&&!line.startsWith('+')))continue;if(lines[n-1]===line.slice(1)){const prior=evidence.at(-1);if(prior?.end===n-1)prior.end=n;else evidence.push({path:file,start:n,end:n});}n++;}return evidence;}
