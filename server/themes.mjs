import { readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

export function themePalette(id,uiTheme,data) {
  const c=data.colors||{},dark=uiTheme!=='vs'&&uiTheme!=='hc-light';
  const color=(key,fallback)=>/^#[0-9a-f]{3,8}$/i.test(c[key]||'')?c[key]:fallback;
  const token=(scope,fallback)=>{
    const found=(data.tokenColors||[]).filter(t=>(Array.isArray(t.scope)?t.scope:String(t.scope||'').split(',')).some(s=>s.trim()===scope)).at(-1)?.settings?.foreground;
    return /^#[0-9a-f]{3,8}$/i.test(found||'')?found:fallback;
  };
  const editor=color('editor.background',dark?'#1f1f1f':'#ffffff');
  const panel=color('sideBar.background',dark?'#181818':'#f8f8f8');
  const ink=color('editor.foreground',dark?'#cccccc':'#333333');
  return {id,label:id,dark,palette:{editor,panel,ink,muted:color('descriptionForeground',dark?'#a6a6a6':'#66717c'),line:color('panel.border',dark?'#333333':'#e0e0e0'),accent:color('button.background','#0078d4'),link:color('textLink.foreground',dark?'#60b4f7':'#006ab1'),selection:color('editor.selectionBackground',dark?'#264f78':'#d8eafa'),input:color('input.background',dark?'#313131':'#ffffff'),hover:color('list.hoverBackground',dark?'#292929':'#f0f0f0'),comment:token('comment',dark?'#7f9c72':'#6a737d'),string:token('string',dark?'#ce9178':'#a31515'),keyword:token('keyword',dark?'#c586c0':'#af00db'),number:token('constant.numeric',dark?'#b5cea8':'#098658'),function:token('entity.name.function',dark?'#dcdcaa':'#795e26'),type:token('entity.name.type',dark?'#4ec9b0':'#267f99')}};
}
export function chooseTheme(active,themes) {const found=themes.find(t=>t.id===active);return {id:(found||themes.find(t=>t.id==='Dark Modern')||themes[0]).id,matched:!!found};}
async function jsonc(file){return ts.parseConfigFileTextToJson(file,await readFile(file,'utf8')).config||{};}
async function themeData(file,depth=0){if(depth>8)return {};const data=await jsonc(file);if(!data.include)return data;const inherited=await themeData(path.resolve(path.dirname(file),data.include),depth+1);return {...inherited,...data,colors:{...inherited.colors,...data.colors},tokenColors:[...(inherited.tokenColors||[]),...(data.tokenColors||[])]};}

export async function getThemes() {
  const user=path.join(os.homedir(),'Library/Application Support/Code/User');
  let settings={},active=null;
  try{settings=await jsonc(path.join(user,'settings.json'));active=settings['workbench.colorTheme'];}catch{}
  if(!active){try{const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(path.join(user,'globalStorage/state.vscdb'),{readOnly:true});try{const row=db.prepare("SELECT value FROM ItemTable WHERE key = 'colorThemeData'").get();active=row?JSON.parse(row.value).settingsId:null;}finally{db.close();}}catch{}}
  const base='/Applications/Visual Studio Code.app/Contents/Resources/app/extensions';
  const wanted=new Set(['Dark 2026','Light 2026','Dark Modern','Light Modern','Monokai','Solarized Dark',active]);
  const themes=[];
  for(const dir of ['theme-defaults','theme-monokai','theme-solarized-dark']){
    try{const pkg=await jsonc(path.join(base,dir,'package.json'));for(const t of pkg.contributes?.themes||[]){if(wanted.has(t.id))themes.push(themePalette(t.id,t.uiTheme,await themeData(path.join(base,dir,t.path))));}}catch{}
  }
  if(active&&!themes.some(t=>t.id===active)){
    const extensions=path.join(os.homedir(),'.vscode/extensions');
    try{for(const dir of (await readdir(extensions,{withFileTypes:true})).filter(d=>d.isDirectory()).slice(0,200)){
      try{const pkg=await jsonc(path.join(extensions,dir.name,'package.json'));for(const t of pkg.contributes?.themes||[]){if(t.id===active||t.label===active)themes.push(themePalette(active,t.uiTheme,await themeData(path.join(extensions,dir.name,t.path))));}}catch{}
    }}catch{}
  }
  if(!themes.some(t=>t.id==='Dark Modern'))themes.push(themePalette('Dark Modern','vs-dark',{}));
  if(!themes.some(t=>t.id==='Light Modern'))themes.push(themePalette('Light Modern','vs',{}));
  return {themes,active,follow:chooseTheme(active,themes),fontFamily:typeof settings['editor.fontFamily']==='string'?settings['editor.fontFamily']:null};
}
