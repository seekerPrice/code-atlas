import { readdir, readFile, realpath, stat, lstat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import ignore from 'ignore';

const supported = new Set(['.ts','.tsx','.mts','.cts','.js','.jsx','.mjs','.cjs','.py','.go','.rs','.java','.c','.h','.cpp','.cs','.rb','.php','.vue','.svelte','.json','.md','.css','.html','.sql','.yaml','.yml','.toml']);
const excluded = new Set(['node_modules','vendor','dist','build','coverage','target','venv','__pycache__','package-lock.json','pnpm-lock.yaml','yarn.lock','bun.lock','auth.json','credentials.json']);
const jsFile = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const slash = p => p.split(path.sep).join('/');
export const digest = text => createHash('sha256').update(text).digest('hex').slice(0,20);
export const inside = (root, file) => { const rel = path.relative(root,file); return rel !== '' && !rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel); };
export function readablePath(rel){return !rel.split('/').some(n=>n.startsWith('.')||excluded.has(n)||/(?:secret|credential|private[-_]?key)/i.test(n))&&supported.has(path.extname(rel).toLowerCase());}
const roleFor = (p,text) => /(?:^|\/)(?:__tests__|tests?|e2e|fixtures)\/|\.(?:test|spec)\./.test(p)?'test':/\.d\.ts$|(?:^|\/)generated\/|@generated|DO NOT EDIT/.test(p+'\n'+text.slice(0,300))?'generated':/\.md$/.test(p)?'docs':/(?:package|tsconfig[^/]*|.*config)\.(?:json|[cm]?js|ts)$|\.(?:yaml|yml|toml)$/.test(p)?'config':/\.json$/.test(p)?'data':'source';
const parse = (text='{}') => ts.parseConfigFileTextToJson('config.json',text).config||{};

// The same bounded snapshot drives parsing, search, hashing, and context validation.
export async function collectProject(input) {
  const root=await realpath(path.resolve(input));
  if(!(await stat(root)).isDirectory())throw new Error('Choose a project folder.');
  const files=[],contents=new Map(),warnings=[];let total=0,limited=false;
  async function walk(dir,depth=0,ancestors=[]){
    if(depth>24){limited=true;return;}
    let rules=ancestors;
    for(const name of ['.gitignore','.atlasignore']){
      try{const p=path.join(dir,name);if(!(await lstat(p)).isSymbolicLink()){const text=await readFile(p,'utf8');if(text.length<256000)rules=[...rules,{dir,ig:ignore().add(text)}];}}catch{}
    }
    const items=await readdir(dir,{withFileTypes:true});items.sort((a,b)=>a.name.localeCompare(b.name));
    for(const item of items){
      if(files.length>=20000||total>=150000000){limited=true;break;}
      if(item.name.startsWith('.')||excluded.has(item.name)||/(?:secret|credential|private[-_]?key)/i.test(item.name)||item.isSymbolicLink())continue;
      const abs=path.join(dir,item.name),rel=slash(path.relative(root,abs));let ignored=false;
      for(const rule of rules){const result=rule.ig.test(slash(path.relative(rule.dir,abs))+(item.isDirectory()?'/':''));if(result.ignored)ignored=true;else if(result.unignored)ignored=false;}
      if(ignored)continue;
      if(item.isDirectory()){await walk(abs,depth+1,rules);continue;}
      if(!item.isFile()||!supported.has(path.extname(item.name).toLowerCase()))continue;
      try{
        const info=await lstat(abs);if(info.isSymbolicLink())continue;
        if(info.size>512000){limited=true;warnings.push(`Large file skipped: ${rel}`);continue;}
        const canonical=await realpath(abs);if(!inside(root,canonical)||canonical!==abs)continue;
        const content=await readFile(abs,'utf8');if(content.includes('\0'))continue;
        total+=info.size;contents.set(abs,content);
        files.push({path:rel,language:languageFor(rel),lines:content.split('\n').length,hash:digest(content),size:info.size,role:roleFor(rel,content)});
      }catch(e){warnings.push(`Could not read: ${rel}`);limited=true;}
    }
  }
  await walk(root);
  return {root,files,contents,limited,warnings:warnings.slice(0,30),revision:digest(files.map(f=>`${f.path}:${f.hash}`).join('|'))};
}

export async function scanProject(input){return analyzeProject(await collectProject(input));}

export function analyzeProject({root,files,contents,limited,warnings,revision}){
  const pkg=parse(contents.get(path.join(root,'package.json')));
  const packages=files.filter(f=>path.basename(f.path)==='package.json').map(f=>{
    const data=parse(contents.get(path.join(root,f.path)));const deps={...data.dependencies,...data.devDependencies};
    return {name:data.name||path.dirname(f.path),path:path.dirname(f.path),file:f.path,frameworks:['next','react','vue','svelte','express','fastify','vite','astro'].filter(d=>deps[d]),dependencies:Object.keys(deps),scripts:data.scripts||{},exports:data.exports,main:data.types||data.module||data.main};
  });
  const frameworks=[...new Set(packages.flatMap(p=>p.frameworks))];
  const configs=new Map();
  function config(abs,seen=new Set()){
    if(configs.has(abs))return configs.get(abs);if(seen.has(abs)||!contents.has(abs))return {};seen.add(abs);
    const json=parse(contents.get(abs)),dir=path.dirname(abs);let inherited={};
    if(typeof json.extends==='string'&&json.extends.startsWith('.')){let base=path.resolve(dir,json.extends);if(!base.endsWith('.json'))base+='.json';inherited=config(base,seen);}
    const own=json.compilerOptions||{},merged={...inherited,...own};
    if(own.paths)merged.paths=Object.fromEntries(Object.entries(own.paths).map(([key,values])=>[key,Array.isArray(values)?values.filter(v=>typeof v==='string').map(v=>path.resolve(dir,own.baseUrl||'.',v)):[]]));
    if(own.baseUrl)merged.baseUrl=path.resolve(dir,own.baseUrl);
    configs.set(abs,merged);return merged;
  }
  const byDirectory=new Map();
  function optionsFor(file){let dir=path.dirname(file);if(byDirectory.has(dir))return byDirectory.get(dir);const original=dir;let result={};while(dir===root||inside(root,dir)){const key=['tsconfig.json','jsconfig.json'].map(n=>path.join(dir,n)).find(p=>contents.has(p));if(key){result=config(key);break;}dir=path.dirname(dir);}byDirectory.set(original,result);return result;}
  function findFile(base){return [base,base.replace(/\.[cm]?js$/,'.ts'),...['.ts','.tsx','.mts','.js','.jsx','.mjs','.json','/index.ts','/index.tsx','/index.js'].map(e=>base+e)].find(p=>contents.has(p));}
  function exportTarget(value){if(typeof value==='string')return value;if(value&&typeof value==='object')return exportTarget(value.types)||exportTarget(value.import)||exportTarget(value.default)||exportTarget(value.require);}
  const resolvedCache=new Map();
  function resolve(spec,from){
    const key=from+'\0'+spec;if(resolvedCache.has(key))return resolvedCache.get(key);let target;
    if(spec.startsWith('.'))target=findFile(path.resolve(path.dirname(from),spec));
    else{
      const options=optionsFor(from);
      for(const [pattern,values]of Object.entries(options.paths||{})){
        const [prefix,suffix='']=pattern.split('*');const match=pattern.includes('*')?spec.startsWith(prefix)&&spec.endsWith(suffix):spec===pattern;
        if(match){const part=pattern.includes('*')?spec.slice(prefix.length,suffix?-suffix.length:undefined):'';for(const value of values){target=findFile(value.replace('*',part));if(target)break;}}if(target)break;
      }
      if(!target){const p=packages.find(p=>spec===p.name||spec.startsWith(p.name+'/'));if(p){const sub=spec===p.name?'.':'./'+spec.slice(p.name.length+1);let mapped=exportTarget(p.exports?.[sub]||(sub==='.'?p.exports:null));if(!mapped&&sub==='.')mapped=p.main||'index.ts';if(!mapped&&sub!=='.')mapped=sub;target=mapped&&findFile(path.resolve(root,p.path,mapped));}}
      if(!target&&options.baseUrl)target=findFile(path.resolve(options.baseUrl,spec));
    }
    resolvedCache.set(key,target);return target;
  }
  const sourceNames=[...contents.keys()].filter(f=>jsFile.test(f));
  const options={allowJs:true,noEmit:true,noLib:true,types:[],module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,jsx:ts.JsxEmit.Preserve,skipLibCheck:true,target:ts.ScriptTarget.Latest};
  // Never load code, plugins, type packages, or files outside the collected snapshot.
  const host={...ts.createCompilerHost(options),fileExists:f=>contents.has(f),readFile:f=>contents.get(f),getSourceFile:(f,version)=>contents.has(f)?ts.createSourceFile(f,contents.get(f),version,true):undefined,writeFile:()=>{},getCurrentDirectory:()=>root,getDefaultLibFileName:()=>'',resolveModuleNames:(names,from)=>names.map(spec=>{const file=resolve(spec,from);return file&&jsFile.test(file)?{resolvedFileName:file,extension:ts.extensionFromPath(file)}:undefined;})};
  const program=ts.createProgram(sourceNames,options,host),checker=program.getTypeChecker();
  const symbols=[],imports=[],calls=[],boundaries=[],nodes=new Map(),nodeIds=new Map();
  for(const abs of sourceNames){const sf=program.getSourceFile(abs);if(!sf)continue;const rel=slash(path.relative(root,abs));
    function visit(node){
      let name,kind;
      if(ts.isFunctionDeclaration(node)){name=node.name?.text||(node.modifiers?.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword)?'default':null);kind='function';}
      else if(ts.isClassDeclaration(node)&&node.name){name=node.name.text;kind='class';}
      else if(ts.isMethodDeclaration(node)&&node.name){name=node.name.getText(sf);kind='method';}
      else if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer&&(ts.isArrowFunction(node.initializer)||ts.isFunctionExpression(node.initializer))){name=node.name.text;kind='function';}
      if(name){const line=sf.getLineAndCharacterOfPosition(node.getStart(sf)).line+1,end=sf.getLineAndCharacterOfPosition(node.getEnd()).line+1,id=`${rel}:${line}:${name}`;symbols.push({id,name,kind,path:rel,line,end});nodes.set(id,node);nodeIds.set(node,id);}
      if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)){
        const spec=node.moduleSpecifier.text,target=resolve(spec,abs);imports.push({from:rel,specifier:spec,to:target?slash(path.relative(root,target)):null,line:sf.getLineAndCharacterOfPosition(node.getStart()).line+1,kind:ts.isExportDeclaration(node)?'re-export':'import'});
      }
      ts.forEachChild(node,visit);
    }visit(sf);
  }
  for(const [id,node]of nodes){if(ts.isClassDeclaration(node))continue;
    function visit(n){if(n!==node&&nodeIds.has(n))return;
      const jsx=ts.isJsxSelfClosingElement(n)||ts.isJsxOpeningElement(n);
      if(ts.isCallExpression(n)||ts.isNewExpression(n)||jsx){const expression=jsx?n.tagName:n.expression;let sym=checker.getSymbolAtLocation(ts.isPropertyAccessExpression(expression)?expression.name:expression);if(sym&&(sym.flags&ts.SymbolFlags.Alias)){try{sym=checker.getAliasedSymbol(sym);}catch{}}
        const decl=sym?.valueDeclaration||sym?.declarations?.[0],to=nodeIds.get(decl),line=n.getSourceFile().getLineAndCharacterOfPosition(n.getStart()).line+1;
        if(to){
          const token=ts.isPropertyAccessExpression(expression)?expression.name:expression,sf=n.getSourceFile();
          const start=sf.getLineAndCharacterOfPosition(token.getStart(sf)),end=sf.getLineAndCharacterOfPosition(token.getEnd());
          calls.push({from:id,to,line,kind:jsx?'renders':ts.isNewExpression(n)?'constructs':'calls',
            ...(start.line===end.line?{reference:{line:start.line+1,start:start.character,end:end.character}}:{})});
        }
        else if(!jsx){const name=expression.getText().slice(0,120);if(/fetch|\.rpc|\.from|\.send|\.publish|\.query|\.execute|\.insert|\.update|\.delete|\.upsert/.test(name))boundaries.push({from:id,path:slash(path.relative(root,n.getSourceFile().fileName)),line,name,kind:'unresolved effect candidate'});}
      }ts.forEachChild(n,visit);
    }visit(node);
  }
  for(const f of files.filter(f=>f.language==='python')){const lines=contents.get(path.join(root,f.path)).split('\n');lines.forEach((line,i)=>{const m=line.match(/^(\s*)(?:async\s+)?(def|class)\s+(\w+)/);if(!m)return;let end=i+1;for(let j=i+1;j<lines.length;j++){if(lines[j].trim()&&lines[j].match(/^\s*/)[0].length<=m[1].length)break;end=j+1;}symbols.push({id:`${f.path}:${i+1}:${m[3]}`,name:m[3],kind:m[2]==='def'?'function':'class',path:f.path,line:i+1,end,approximate:true});});}
  const entries=[];
  for(const f of files){if(f.role==='test'||f.role==='generated')continue;let reason='',rank=9,kind='startup';
    if(/(?:^|\/)app\/(?:.*\/)?page\.[jt]sx?$/.test(f.path)){kind='page';rank=1;reason='A Next.js page entry: begin with the screen a user sees.';if(/(?:^|\/)app\/page\.[jt]sx?$/.test(f.path))rank=0;}
    else if(/(?:^|\/)app\/(?:.*\/)?route\.[jt]s$/.test(f.path)){kind='api';rank=2;reason='A request entry: trace input, validation, permissions, and response.';}
    else if(/(?:^|\/)(?:main|server|app|index)\.(?:[cm]?[jt]s|tsx|py|go|rs)$/.test(f.path)){rank=4;reason='Possible startup or exports file; confirm against package scripts.';}
    else if(/(?:^|\/)pages\/.*\.[jt]sx?$/.test(f.path)){kind='page';rank=2;reason='File-based page or API entry.';}
    else if(/^(?:README|readme)\.md$/.test(f.path)){kind='guide';rank=3;reason='Project instructions and intent; compare them with the implementation.';}
    if(reason)entries.push({path:f.path,reason,rank,kind});
  }
  entries.sort((a,b)=>a.rank-b.rank||a.path.length-b.path.length||a.path.localeCompare(b.path));
  if(!entries.length&&files.length)entries.push({path:files.find(f=>jsFile.test(f.path))?.path||files[0].path,reason:'No framework entry detected. Start here and inspect its connections.',rank:9,kind:'candidate'});
  return {id:digest(root),root,name:pkg.name||path.basename(root),files,symbols,imports,calls,boundaries,entries,packages:packages.map(({exports,main,...p})=>p),frameworks,scripts:pkg.scripts||{},limited,warnings,revision,indexedAt:new Date().toISOString()};
}

export async function readProjectFile(project,relative){
  if(typeof relative!=='string'||!project.files.some(f=>f.path===relative))throw new Error('This file is not part of the readable project index.');
  const file=path.resolve(project.root,relative);if(!inside(project.root,file)||(await lstat(file)).isSymbolicLink())throw new Error('Reading outside the project is not allowed.');
  const canonical=await realpath(file);if(!inside(project.root,canonical)||canonical!==file)throw new Error('Reading symlinks or outside the project is not allowed.');
  if((await stat(canonical)).size>512000)throw new Error('This file is too large to display.');
  const content=await readFile(canonical,'utf8');return {path:relative,content,hash:digest(content),language:languageFor(relative)};
}
function languageFor(file){return ({'.ts':'typescript','.tsx':'typescript','.mts':'typescript','.cts':'typescript','.js':'javascript','.jsx':'javascript','.mjs':'javascript','.cjs':'javascript','.py':'python','.rs':'rust','.go':'go','.md':'markdown','.json':'json','.html':'xml','.vue':'xml','.svelte':'xml','.yml':'yaml','.cs':'csharp','.h':'c','.toml':'ini'})[path.extname(file)]||path.extname(file).slice(1)||'plaintext';}

export async function projectContext(project,file,selection,range){return (await contextBundle(project,file,selection,range)).text;}
export async function contextBundle(project,file,selection,range){
  const fileSymbols=new Set(project.symbols.filter(s=>s.path===file).map(s=>s.id));
  const symbol=project.symbols.find(s=>s.id===selection),related=project.calls.filter(c=>selection?(c.from===selection||c.to===selection):fileSymbols.has(c.from)).slice(0,30);
  const details={name:project.name,frameworks:project.frameworks,packages:(project.packages||[]).map(p=>({name:p.name,path:p.path,frameworks:p.frameworks,dependencies:p.dependencies.slice(0,30),scripts:Object.fromEntries(Object.entries(p.scripts).slice(0,6))})),scripts:Object.fromEntries(Object.entries(project.scripts).slice(0,12)),...(!file?{entries:project.entries.slice(0,12)}:{}),selected:symbol||null,range,symbols:project.symbols.filter(s=>s.path===file).slice(0,70),calls:related,boundaries:project.boundaries?.filter(b=>b.path===file).slice(0,20),limitations:'Static analysis only. Unresolved dynamic calls, library internals, and external policies are unknown.'};
  let text=JSON.stringify(details,null,2).slice(0,16000),evidence=[];const candidates=[];
  if(file)candidates.push({path:file,line:range?.start||symbol?.line||1,end:range?.end||symbol?.end});
  for(const c of related){for(const id of [c.to,c.from]){const s=project.symbols.find(s=>s.id===id);if(s&&s.id!==selection)candidates.push(s);}}
  if(file&&(symbol?.line||range?.start||1)>8)candidates.push({path:file,line:1,end:Math.min((symbol?.line||range.start)-1,120)});
  if(file)candidates.push(...project.imports.filter(i=>i.from===file&&i.to).map(i=>({path:i.to,line:1})));
  if(file){const base=path.basename(file).replace(/\.[^.]+$/,'');candidates.push(...project.files.filter(f=>f.role==='test'&&path.basename(f.path).startsWith(base+'.')).slice(0,2).map(f=>({path:f.path,line:1})));}
  if(!file){candidates.push(...project.entries.slice(0,5).map(e=>({path:e.path,line:1})));for(const p of project.packages||[])candidates.push({path:p.file,line:1});}
  const seen=new Set();
  for(const item of candidates){if(evidence.length>=10||text.length>=65000)break;const key=item.path+':'+(item.line||1);if(seen.has(key))continue;seen.add(key);
    if(evidence.some(e=>e.path===item.path&&e.start<=(item.line||1)&&e.end>=(item.end||item.line||1)))continue;
    const data=await readProjectFile(project,item.path),meta=project.files.find(f=>f.path===item.path);if(data.hash!==meta.hash)throw new Error('Source changed during context preparation. Refresh the index.');
    const lines=data.content.split('\n'),start=Math.max(1,(item.line||1)-4),end=Math.min(lines.length,item.end?item.end+4:start+179);let used=start-1,excerpt='';
    for(let n=start;n<=end;n++){const line=`${n}: ${lines[n-1]}\n`;if(excerpt.length+line.length>18000||text.length+excerpt.length+line.length>65000)break;excerpt+=line;used=n;}
    if(used<start)continue;evidence.push({path:item.path,start,end:used,hash:data.hash});
    text+=`\n\nFILE ${item.path} lines ${start}–${used} of ${lines.length} (hash ${data.hash})\n${excerpt}END FILE (other lines not supplied)\n`;
  }
  // Call metadata is evidence even when its source excerpt falls outside the budget.
  const dependencies=[...new Set([...evidence.map(item=>item.path),...related.flatMap(call=>[call.from,call.to]).map(id=>project.symbols.find(item=>item.id===id)?.path).filter(Boolean)])];
  return {text,evidence,dependencies};
}
