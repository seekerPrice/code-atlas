import {syntaxLines,linkSource} from './source.js';
import {markdown} from './markdown.js';
import {coachingMarkup,evidenceButtons} from './workbench.js';
import {matchConcept,listExerciseConcepts,chooseExercise,gradeExercise} from './exercises.js';
import {loadLearning,saveLearning,recordAttempt,suggestLesson,learningContext} from './learning.js';
import {loadEvidence,saveEvidence,recordEvidence} from './evidence.js';
import {readNotebook,writeNotebook,exportNotebook,isCurrent} from './notebook.js';

const $=s=>document.querySelector(s);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={
  book:'<path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4z"/><path d="M20 4h-4a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h3z"/>',
  folder:'<path d="M3 7V5h6l2 2h10v13H3z"/>',
  file:'<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6"/>',
  search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
  spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',
  map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"/>',
  review:'<path d="m12 3 8 4v6c0 5-8 8-8 8s-8-3-8-8V7zM8 12l3 3 5-6"/>',
  flow:'<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M9 6h9v9M6 9v9h9"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  send:'<path d="m3 3 19 9-19 9 4-9zM7 12h15"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  stop:'<rect x="5" y="5" width="14" height="14" rx="2"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  branch:'<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="6" r="2"/><path d="M6 7v10M6 14c8 0 12-2 12-6"/>',
  bulb:'<path d="M9 18h6M9 21h6M8 14a6 6 0 1 1 8 0l-1 2H9z"/>',
  code:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>',
  back:'<path d="m14 5-7 7 7 7"/>',
};
const icon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.file}</svg>`;
const state={token:'',project:null,file:null,symbol:null,mode:'explain',view:'overview',status:null,busy:false,controller:null,history:[],selectedLine:null,auto:localStorage.getItem('atlas-auto')!=='false',read:new Set(),navigation:[],forward:[],filter:'',range:null,depth:'normal',journey:null,diff:null,changes:null,scope:'working',notebook:[],searchKind:'symbols',searchQuery:'',treeLimit:250,stale:false,focusCode:false};
Object.assign(state,{comparison:null,feature:null,activeFeature:false,verification:null,testEvidence:null,learning:[],concept:'',peekSequence:0,arrivalReason:'Opened source'});
let fileSequence=0,autoTimer,workSequence=0,folderSequence=0;
let themeSettings=null;

async function api(url,options={}) {
  const res=await fetch(url,{...options,headers:{'Content-Type':'application/json','X-Atlas-Token':state.token,...options.headers}});
  const data=await res.json();if(!res.ok)throw new Error(data.error||'Something went wrong.');return data;
}
function notify(text) {$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('#toast').classList.remove('visible'),5000);}
function safe(fn){return (...args)=>Promise.resolve(fn(...args)).catch(e=>notify(e.message));}

function shell() {
  $('#app').innerHTML=`
    <header class="topbar">
      <a class="brand" href="#" id="home"><img src="/favicon.svg" alt=""><span>Code Atlas</span><span class="personal">Personal</span></a>
      <div class="top-center"><span class="local-dot"></span> Your code, a little clearer.</div>
      <div class="top-actions"><label class="theme-control">${icon('bulb')}<select id="theme-picker" aria-label="Color theme"><option value="vscode">Follow VS Code</option><option value="atlas">Atlas light</option></select></label><button id="account" class="account"><span class="status-dot"></span><span id="account-label">Checking Codex…</span>${icon('chevron')}</button></div>
    </header>
    <div class="workspace">
      <aside class="sidebar">
        <button class="project-picker" id="open-folder" aria-label="Open a project folder">${icon('folder')}<span><strong id="project-name">Your workspace</strong><small id="project-detail">Open a local project</small></span>${icon('chevron')}</button>
        <nav class="main-nav" aria-label="Workspace views">
          <button class="nav-item active" data-view="overview" aria-label="Project overview">${icon('map')}<span>Project overview</span></button>
          <button class="nav-item" data-view="code" aria-label="Read the code">${icon('code')}<span>Read the code</span></button>
          <button class="nav-item" data-view="review" aria-label="Review and learn">${icon('review')}<span>Review & learn</span></button>
          <button class="nav-item" data-view="recommendations" aria-label="AI recommendations">${icon('spark')}<span>AI recommendations</span></button>
          <button class="nav-item" data-view="explore" aria-label="Explore connections">${icon('search')}<span>Explore connections</span></button>
          <button class="nav-item" data-view="changes" aria-label="Review changes">${icon('branch')}<span>Review changes</span></button>
          <button class="nav-item" data-view="features" aria-label="Follow a feature">${icon('flow')}<span>Follow a feature</span></button>
          <button class="nav-item" data-view="learning" aria-label="Learning plan">${icon('bulb')}<span>Learning plan</span></button>
          <button class="nav-item" data-view="answers" aria-label="Saved explanations">${icon('book')}<span>Saved explanations</span></button>
          <button class="nav-item" data-view="notebook" aria-label="Learning notebook">${icon('book')}<span>Learning notebook</span></button>
        </nav>
        <div class="explorer-label"><span>Explorer</span><button class="icon-button" id="refresh" title="Refresh project index" aria-label="Refresh project index">${icon('refresh')}</button></div>
        <label class="file-search">${icon('search')}<input id="file-search" placeholder="Find a file…" aria-label="Find a file"><kbd>/</kbd></label>
        <div class="file-tree" id="file-tree"><p class="tree-empty">Your files will appear here.</p></div>
        <div class="sidebar-bottom"><span class="local-dot"></span><span>Runs on your computer</span><button class="icon-button" id="about" aria-label="About privacy and usage">${icon('bulb')}</button></div>
      </aside>
      <main id="main"></main>
    </div>
    <footer class="statusbar"><span>${icon('book')} Read-only workspace</span><span id="index-status">Ready when you are</span><span>Powered by your Codex login</span></footer>`;
  $('#open-folder').onclick=safe(()=>folderDialog());
  $('#home').onclick=e=>{e.preventDefault();cancelExplanation();state.view='overview';renderMain();};
  $('#theme-picker').onchange=e=>{localStorage.setItem('atlas-theme',e.target.value);applyTheme(e.target.value);};
  $('#refresh').onclick=safe(refreshProject);
  $('#file-search').oninput=e=>{state.filter=e.target.value;state.treeLimit=250;renderTree();};
  $('#account').onclick=safe(async()=>{
    if(state.status?.connected){notify('Using your existing ChatGPT sign-in. Codex usage limits apply; there is no API-key fallback.');return;}
    if(!state.status?.installed){notify('Install Codex CLI with npm install -g @openai/codex, then restart this app.');return;}
    await api('/api/login',{method:'POST',body:'{}'});notify('Complete the Codex sign-in in your browser.');
    let attempts=0;const timer=setInterval(async()=>{await updateStatus();if(state.status?.connected||++attempts>60)clearInterval(timer);},2500);
  });
  $('#about').onclick=()=>notify('Source is indexed locally. Asking Codex sends selected code context to OpenAI through your existing account. No app fee or API-key billing.');
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{
    cancelExplanation();
    fileSequence++;state.view=b.dataset.view;
    if(state.view!=='changes')state.diff=null;
    state.history=[];
    if(state.view==='recommendations')state.mode='recommend';
    else if(state.view==='review')state.mode='review';
    else if(state.view==='code')state.mode='explain';
    renderMain();
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();$('#file-search').focus();}
    if(e.key==='Escape'&&state.busy)cancelExplanation();
  });
}

async function updateStatus(){
  try{state.status=await api('/api/status');$('#account-label').textContent=state.status.connected?'Codex connected':state.status.installed?'Sign in with Codex':'Codex not installed';$('#account').classList.toggle('connected',state.status.connected);}catch{$('#account-label').textContent='Reconnect local app';}
}

function applyTheme(id){
  const root=document.documentElement;
  if(id==='atlas'){root.dataset.theme='atlas';root.style.cssText='';return;}
  const resolved=id==='vscode'?themeSettings?.follow.id:id;
  const theme=themeSettings?.themes.find(t=>t.id===resolved);
  if(!theme)return;
  root.dataset.theme=theme.id;root.dataset.appearance=theme.dark?'dark':'light';
  root.style.colorScheme=theme.dark?'dark':'light';
  for(const [key,value]of Object.entries(theme.palette))root.style.setProperty('--theme-'+key,value);
  if(themeSettings.fontFamily)root.style.setProperty('--mono',themeSettings.fontFamily);
}
async function loadThemes(){
  try{
    themeSettings=await api('/api/themes');
    const picker=$('#theme-picker'),saved=localStorage.getItem('atlas-theme')||'vscode';
    picker.innerHTML=`<option value="vscode">Follow VS Code${themeSettings.active?' · '+escape(themeSettings.active):''}${!themeSettings.follow.matched?' (fallback)':''}</option>${themeSettings.themes.map(t=>`<option value="${escape(t.id)}">${escape(t.label)}</option>`).join('')}<option value="atlas">Atlas light</option>`;
    picker.value=[...picker.options].some(o=>o.value===saved)?saved:'vscode';applyTheme(picker.value);
  }catch{applyTheme('atlas');}
}

function renderTree(){
  const p=state.project;
  if(!p)return;
  const matching=p.files.filter(f=>f.path.toLowerCase().includes(state.filter.toLowerCase()));
  const files=matching.slice(0,state.treeLimit);
  const groups=new Map();
  files.forEach(f=>{const parts=f.path.split('/'),group=parts.length>1?parts.slice(0,-1).join('/'):'Project files';if(!groups.has(group))groups.set(group,[]);groups.get(group).push(f);});
  $('#file-tree').innerHTML=files.length?[...groups].map(([group,items])=>`<div class="file-group"><div class="directory">${icon('folder')}<span>${escape(group)}</span></div>${items.map(f=>`<button class="file-item ${state.file?.path===f.path?'selected':''}" data-file="${escape(f.path)}" title="${escape(f.path)}"><span class="file-type ${f.language}">${typeBadge(f.path)}</span><span>${escape(f.path.split('/').pop())}</span>${state.read.has(f.path)?'<span class="read-mark">✓</span>':''}</button>`).join('')}</div>`).join(''):'<p class="tree-empty">No matching files.</p>';
  if(matching.length>files.length){$('#file-tree').insertAdjacentHTML('beforeend',`<button class="text-button" id="more-files">Show more (${matching.length-files.length} remaining)</button>`);$('#more-files').onclick=()=>{state.treeLimit+=250;renderTree();};}
  $('#file-tree').querySelectorAll('[data-file]').forEach(b=>b.onclick=safe(()=>openFile(b.dataset.file)));
}
function typeBadge(file){const ext=file.split('.').pop();return ({tsx:'Ts',ts:'Ts',jsx:'Js',js:'Js',mjs:'Js',json:'{}',md:'M↓',py:'Py',css:'#',html:'◇'})[ext]||ext.slice(0,2);}

function updateProjectChrome(){
  const p=state.project;if(!p)return;
  $('#project-name').textContent=p.name;$('#project-detail').textContent=p.frameworks.length?p.frameworks.join(' / '):'Local source files';
  $('#index-status').textContent=`${p.files.length} files · ${p.symbols.length} symbols${p.limited?' · partial index':''}`;
  renderTree();
}

function renderMain(){
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));
  if(!state.project)return renderWelcome();
  if(state.view==='overview')return renderOverview();
  if(state.view==='explore')return renderExplore();
  if(state.view==='changes')return renderChanges();
  if(state.view==='notebook')return renderNotebook();
  if(state.view==='features')return renderFeatures();
  if(state.view==='learning')return renderLearning();
  if(state.view==='answers')return renderAnswers();
  renderReader();
}

function renderWelcome(){
  $('#main').innerHTML=`<div class="welcome"><div class="welcome-graphic"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="atlas-mark"><img src="/favicon.svg" alt=""></div><span class="orbit-node node-one">${icon('code')}</span><span class="orbit-node node-two">${icon('bulb')}</span><span class="orbit-node node-three">${icon('branch')}</span></div><h1>You built it.<br>Now make sense of it.</h1><p>A quiet place to explore your code, follow the connections,<br class="desktop-break"> and learn to review what AI helped you create.</p><div class="welcome-actions"><button class="primary" id="welcome-open">${icon('folder')} Open a project</button><button class="secondary" id="welcome-demo">Explore an example ${icon('arrow')}</button></div><div class="welcome-notes"><span>${icon('check')} Free local app</span><span>${icon('check')} Your existing Codex login</span><span>${icon('check')} No API key</span></div><div class="welcome-footnote">Explanations use your Codex allowance. Your source files stay unchanged.</div></div>`;
  $('#welcome-open').onclick=safe(()=>folderDialog());$('#welcome-demo').onclick=safe(()=>openProject({demo:true}));
}

function renderOverview(){
  const p=state.project;
  const top=p.entries.slice(0,5);
  $('#main').innerHTML=`<div class="overview-scroll"><div class="page-heading"><div class="breadcrumb">Workspace ${icon('chevron')} Project overview</div><div class="heading-row"><div><h1>Get to know ${escape(p.name)}.</h1><p>Start with a small path. Build the bigger picture as you go.</p></div><button class="secondary" id="change-project">${icon('folder')} Open project</button></div></div>
    <div class="overview-grid"><section class="start-card"><div class="section-title">${icon('map')}<h2>Your starting points</h2><span class="pill">Detected locally</span></div><p class="section-description">A suggested reading order, based on the project’s files and conventions.</p><div class="journey-list">${top.map((entry,i)=>`<button class="journey-stop" data-start="${escape(entry.path)}"><span class="step-number">${i+1}</span><span class="stop-text"><strong>${escape(entry.path)}</strong><span>${escape(entry.reason)}</span></span>${icon('arrow')}</button>`).join('')||'<p>No readable source files found. Open a different folder.</p>'}</div><div class="card-footnote">${icon('bulb')} Entry points are candidates, not a complete execution trace.</div></section>
    <aside class="project-summary"><h2>The project at a glance</h2><div class="stat-row"><span>Readable files</span><strong>${p.files.length}</strong></div><div class="stat-row"><span>Functions & classes</span><strong>${p.symbols.length}</strong></div><div class="stat-row"><span>Resolved calls</span><strong>${p.calls.length}</strong></div><div class="framework-tags">${p.frameworks.map(f=>`<span>${escape(f)}</span>`).join('')||'<span>Source project</span>'}</div><div class="summary-divider"></div><h3>Make it click</h3><p>Use Codex to explain the architecture and suggest a path tailored to this project.</p><button class="primary full-width" id="overview-explain">${icon('spark')} Explain this project</button><small>Uses your Codex allowance. No API key.</small></aside></div>
    <div class="learning-section"><h2>Three ways to understand more</h2><div class="learning-options"><button data-action="explain"><span class="option-icon blue">${icon('book')}</span><strong>Read with a guide</strong><p>Click a function. Understand its job, its inputs, and what happens next.</p><span class="option-link">Explore the code ${icon('arrow')}</span></button><button data-action="flow"><span class="option-icon teal">${icon('flow')}</span><strong>Follow the data</strong><p>Trace a value from where it enters to where it changes something.</p><span class="option-link">Trace a flow ${icon('arrow')}</span></button><button data-action="practice"><span class="option-icon amber">${icon('bulb')}</span><strong>Try it yourself</strong><p>Make a prediction, explain your reasoning, and learn with feedback.</p><span class="option-link">Practice reviewing ${icon('arrow')}</span></button></div></div>
    <section class="architecture-section"><h2>Workspace map</h2><p>Packages and their declared dependencies. Select one to browse its files.</p><div class="package-grid">${(p.packages||[]).map(pkg=>`<button class="package-card" data-package="${escape(pkg.path)}"><strong>${escape(pkg.name)}</strong><span>${escape(pkg.path)}</span><small>${escape(pkg.frameworks.join(' · ')||'Shared package / tooling')}</small><small>${pkg.dependencies.length} declared dependencies</small></button>`).join('')}</div><button class="text-button" id="all-entries">Explore all ${p.entries.length} entry candidates and symbols ${icon('arrow')}</button></section>
    ${p.limited?`<details class="notice"><summary>Some files were omitted from this index</summary><p>Limits: 20,000 files, 512 KB per file, 150 MB total, 24 folder levels.</p>${(p.warnings||[]).map(w=>`<p>${escape(w)}</p>`).join('')}</details>`:''}
    <div class="overview-foot">${icon('folder')}<span>${escape(p.root)}</span><span>Source is read-only</span></div></div>`;
  document.querySelectorAll('[data-package]').forEach(b=>b.onclick=()=>{state.filter=b.dataset.package==='.'?'':b.dataset.package+'/';$('#file-search').value=state.filter;renderTree();});
  $('#all-entries').onclick=()=>{state.view='explore';renderMain();};
  $('#change-project').onclick=safe(()=>folderDialog());
  document.querySelectorAll('[data-start]').forEach(b=>b.onclick=safe(()=>openFile(b.dataset.start)));
  document.querySelectorAll('[data-action]').forEach(b=>b.onclick=safe(async()=>{state.mode=b.dataset.action;await openFile(top[0]?.path||p.files[0]?.path);if(state.mode!=='explain')await ask();}));
  $('#overview-explain').onclick=()=>{cancelExplanation();state.history=[];state.view='code';state.mode='overview';renderReader();ask();};
}

function renderReader(){
  const p=state.project,f=state.file;
  $('#main').innerHTML=`<div class="reader"><div class="reader-toolbar"><div class="reader-breadcrumb"><button class="icon-button" id="back" title="Back to previous file" aria-label="Back to previous file">${icon('back')}</button><button class="icon-button" id="forward" aria-label="Forward to next file">${icon('chevron')}</button><span>${escape(p.name)}</span>${icon('chevron')}<strong id="current-file">${escape(f?.path||'Choose a starting point')}</strong></div><label class="auto-label"><input type="checkbox" id="auto-explain" ${state.auto?'checked':''}><span>Auto explain</span></label></div><div id="reading-trail" class="reading-trail"></div><div id="reader-tools" class="reader-tools"></div><div id="recommendation-controls"></div><div id="verification-panel"></div><div id="journey-panel"></div><div class="reading-columns"><section class="source-pane"><div class="source-header"><span>${icon('code')} Source</span><span class="read-only-label">Read only</span></div><div id="symbol-bar" class="symbol-bar"></div><div id="source" class="source-area" tabindex="0" aria-label="Source code"></div><div id="connections" class="connections"></div></section><section class="explanation-pane"><div class="explanation-header"><div class="guide-title"><span class="guide-icon">${icon('spark')}</span><div><strong>${state.mode==='recommend'?'AI recommendations':'Your code guide'}</strong><small>Connected to your Codex</small></div></div><button id="clear-chat" class="icon-button" title="Clear this conversation" aria-label="Clear this conversation">${icon('refresh')}</button></div><div class="mode-tabs" role="tablist" aria-label="Guide mode">${[['explain','Explain','book'],['flow','Trace','flow'],['review','Review','review'],['recommend','Improve','spark'],['practice','Practice','bulb'],['teachback','Teach back','bulb'],['verify','Verify','review']].map(([mode,label,i])=>`<button role="tab" aria-selected="${state.mode===mode}" data-mode="${mode}" class="${state.mode===mode?'active':''}">${icon(i)} ${label}</button>`).join('')}</div><div id="conversation" class="conversation" aria-live="polite"></div><div class="ask-area"><div id="selection-context" class="selection-context"></div><form id="ask-form"><textarea id="question" rows="2" placeholder="Ask anything about this code…" aria-label="Ask about this code" maxlength="6000"></textarea><div class="ask-footer"><span id="ask-hint">Uses Codex allowance · no API key</span><button type="submit" id="send" class="send-button" aria-label="Send question">${icon('send')}</button></div></form><button id="stop" class="stop-button" hidden>${icon('stop')} Stop explanation</button></div></section></div></div>`;
  $('#auto-explain').onchange=e=>{state.auto=e.target.checked;localStorage.setItem('atlas-auto',String(state.auto));cancelExplanation();if(state.auto&&state.file)scheduleExplanation();};
  $('#back').disabled=!state.navigation.length;$('#forward').disabled=!state.forward.length;
  $('#back').onclick=safe(async()=>{const prior=state.navigation.pop();if(prior){state.forward.push(locationRecord());await openFile(prior.path,{...prior,push:false});}});
  $('#forward').onclick=safe(async()=>{const next=state.forward.pop();if(next){state.navigation.push(locationRecord());await openFile(next.path,{...next,push:false});}});
  $('#clear-chat').onclick=()=>{cancelExplanation();state.history=[];renderConversation();};
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{cancelExplanation();state.mode=b.dataset.mode;state.view=state.mode==='recommend'?'recommendations':'code';state.verificationOpen=state.mode==='verify';state.journeyOpen=state.mode==='flow';state.history=[];renderMain();});
  $('#ask-form').onsubmit=e=>{e.preventDefault();ask($('#question').value.trim());};
  $('#question').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask($('#question').value.trim());}};
  $('#stop').onclick=cancelExplanation;
  renderSource();renderConversation();updateSelectionContext();renderReaderTools();renderJourney();renderTrail();renderVerification();renderRecommendationControls();
  const selected=state.selectedLine||state.symbol?.line;if(selected)$('#source').querySelector(`[data-line="${selected}"]`)?.scrollIntoView({block:'center'});
}

function renderSource(){
  const f=state.file,p=state.project;
  if(!$('#source'))return;
  if(state.diff){renderDiffSource();return;}
  if(!f){$('#source').innerHTML=`<div class="source-empty">${icon('book')}<h3>Start somewhere small.</h3><p>Choose a file on the left, or start with a suggested entry point.</p>${p.entries.slice(0,3).map(e=>`<button class="text-button" data-empty-file="${escape(e.path)}">${escape(e.path)} ${icon('arrow')}</button>`).join('')}</div>`;document.querySelectorAll('[data-empty-file]').forEach(b=>b.onclick=safe(()=>openFile(b.dataset.emptyFile)));return;}
  const symbols=p.symbols.filter(s=>s.path===f.path);
  $('#symbol-bar').innerHTML=`<label for="symbol-select">Jump to</label><select id="symbol-select"><option value="">Whole file</option>${symbols.map(s=>`<option value="${escape(s.id)}" ${state.symbol?.id===s.id?'selected':''}>${escape(s.name)} · line ${s.line}</option>`).join('')}</select><span>${f.content.split('\n').length} lines</span>`;
  $('#symbol-select').onchange=e=>selectSymbol(symbols.find(s=>s.id===e.target.value)||null);
  const lines=f.content.split('\n');
  const highlighted=syntaxLines(f.content,f.language);
  $('#source').innerHTML=`<div class="code-table">${lines.map((line,i)=>{
    const n=i+1,html=highlighted[i]||' ';
    const starts=symbols.some(s=>s.line===n);const effect=p.boundaries?.find(b=>b.path===f.path&&b.line===n);const boilerplate=/^\s*(?:$|\/\/|\*|import\s)/.test(line);
    return `<div class="code-line ${starts?'symbol-start':''} ${effect?'effect-line':''} ${boilerplate?'support-line':''}" title="${escape(effect?'Potential external effect: '+effect.name:starts?'Function or class definition':'')}" data-line="${n}"><button class="line-number" tabindex="-1" aria-label="Select line ${n}">${n}</button><code>${html}</code></div>`;
  }).join('')}</div>`;
  const symbolById=new Map(p.symbols.map(s=>[s.id,s]));
  linkSource($('#source'),p.calls.filter(c=>symbolById.get(c.from)?.path===f.path&&symbolById.has(c.to)).map(c=>({reference:c.reference,target:symbolById.get(c.to)})),safe(target=>openFile(target.path,{symbolId:target.id,line:target.line,why:`Followed a call to ${target.name}`,featureContext:state.activeFeature})),safe(peekDefinition));
  $('#source').querySelectorAll('[data-line]').forEach(line=>line.onclick=event=>{
    const n=Number(line.dataset.line);
    const containing=symbols.filter(s=>s.line<=n&&s.end>=n).sort((a,b)=>(a.end-a.line)-(b.end-b.line))[0];
    if(event.shiftKey&&state.selectedLine){cancelExplanation();resetSelectionInsights();state.range={start:Math.min(state.selectedLine,n),end:Math.max(state.selectedLine,n)};state.symbol=null;state.history=[];renderConversation();updateSelectionContext();renderReaderTools();highlightSelection();renderConnections();if($('#symbol-select'))$('#symbol-select').value='';scheduleExplanation();return;}
    state.selectedLine=n;state.range=null;selectSymbol(containing||null,false);highlightSelection();
  });
  $('#source').classList.toggle('focus-code',state.focusCode);highlightSelection();renderConnections();
  if(f.stale)notify('This file changed since indexing. Use Refresh before requesting an explanation.');
}

function highlightSelection(){
  if(!$('#source'))return;
  $('#source').querySelectorAll('[data-line]').forEach(el=>{const n=Number(el.dataset.line);el.classList.toggle('in-selection',state.range?n>=state.range.start&&n<=state.range.end:state.symbol?n>=state.symbol.line&&n<=state.symbol.end:n===state.selectedLine);});
}
function selectSymbol(symbol,scroll=true){
  cancelExplanation();resetSelectionInsights();state.symbol=symbol;state.range=null;state.history=[];
  if($('#symbol-select'))$('#symbol-select').value=symbol?.id||'';
  highlightSelection();renderConnections();updateSelectionContext();renderConversation();renderReaderTools();
  if(scroll&&symbol)$('#source').querySelector(`[data-line="${symbol.line}"]`)?.scrollIntoView({block:'center',behavior:'smooth'});
  scheduleExplanation();
}
function updateSelectionContext(){if($('#selection-context'))$('#selection-context').innerHTML=`${icon('file')}<span>${escape(state.mode==='overview'?'Project overview':state.diff?`Change: ${state.diff.path}`:state.range?`Lines ${state.range.start}–${state.range.end}`:state.symbol?`${state.symbol.name} · lines ${state.symbol.line}–${state.symbol.end}`:state.file?.path||'Project overview')}</span>`;}

function renderConnections(){
  if(!$('#connections'))return;
  const p=state.project,s=state.symbol;
  let incoming=[],outgoing=[];
  if(s){incoming=p.calls.filter(c=>c.to===s.id).map(c=>{const caller=p.symbols.find(x=>x.id===c.from);return caller?{...caller,line:c.line}:null;});outgoing=p.calls.filter(c=>c.from===s.id).map(c=>p.symbols.find(x=>x.id===c.to));}
  else{outgoing=p.imports.filter(i=>i.from===state.file?.path&&i.to).map(i=>({name:i.to,path:i.to}));}
  const links=list=>[...new Map(list.filter(Boolean).map(x=>[`${x.id||x.path}:${x.line||1}`,x])).values()].map(x=>`<button data-related="${escape(x.path)}" data-symbol="${escape(x.id||'')}" data-related-line="${x.line||1}" title="Open ${escape(x.path)}:${x.line||1}"><span>${escape(x.name)}<small>${escape(x.path)}:${x.line||1}</small></span> ${icon('arrow')}</button>${x.id?`<button class="connection-peek" data-peek-symbol="${escape(x.id)}" aria-label="Preview ${escape(x.name)}">Peek</button>`:''}`).join('');
  $('#connections').innerHTML=`<div class="connections-title">${icon('branch')} ${s?'Function connections':'Local imports'}<span>Static analysis</span></div>${s?`<div class="connection-row"><span>Called by</span><div>${links(incoming)||'<small>No callers resolved</small>'}</div></div>`:''}<div class="connection-row"><span>${s?'Calls':'Imports'}</span><div>${links(outgoing)||'<small>No local connections resolved</small>'}</div></div><p>Dynamic calls and external code may be missing.</p>`;
  $('#connections').querySelectorAll('[data-peek-symbol]').forEach(b=>b.onclick=safe(()=>peekDefinition(p.symbols.find(s=>s.id===b.dataset.peekSymbol))));
  $('#connections').querySelectorAll('[data-related]').forEach(b=>b.onclick=safe(()=>openFile(b.dataset.related,{symbolId:b.dataset.symbol,line:Number(b.dataset.relatedLine),featureContext:state.activeFeature})));
}

function renderConversation(){
  const target=$('#conversation');if(!target)return;
  if(!state.history.length){
    const copy={recommend:['Find worthwhile improvements.','Refactoring, repeated logic, maintainability, performance, tests, and clarity. Each suggestion includes evidence and trade-offs.','Generate recommendations'],explain:['Make this code make sense.','Get a plain-language explanation, grounded in the source beside you.','Explain this code'],flow:['See where the data goes.','Follow the inputs, transformations, and effects across the supplied code.','Trace this flow'],review:['Build your reviewer’s eye.','Look for supported risks, question assumptions, and learn what to verify.','Review this code'],practice:['Your turn to connect the dots.','Try a prediction first. Codex will help you reason through your answer.','Give me a question'],verify:['Check the claim against the code.','Inspect related tests and record what you actually observed.','Build a verification plan'],teachback:['Explain it in your own words.','Describe the input, output, and failure cases. Codex will ask a question before giving feedback.','Start teach-back'],overview:['See the bigger picture.','Understand the structure, entry points, and a useful reading order.','Explain this project']}[state.mode];
    target.innerHTML=`<div class="guide-empty"><div class="empty-illustration">${icon(state.mode==='practice'?'bulb':state.mode==='review'?'review':'book')}</div><h2>${copy[0]}</h2><p>${copy[1]}</p><button class="primary" id="explain-now">${icon('spark')} ${copy[2]}</button><div class="starter-questions">${(state.mode==='recommend'?['Is any logic duplicated in these excerpts?','What should I refactor first, and why?','What should stay as it is?']:['What should I understand first?','What could go wrong here?','Explain the unfamiliar syntax']).map(q=>`<button data-question="${escape(q)}">${escape(q)} ${icon('arrow')}</button>`).join('')}</div><small>Only the selected context is sent to Codex.<br>AI explanations can be wrong. Follow the evidence.</small></div>`;
    $('#explain-now').onclick=()=>ask();target.querySelectorAll('[data-question]').forEach(b=>b.onclick=()=>ask(b.dataset.question));return;
  }
  target.innerHTML=state.history.map((m,messageIndex)=>m.role==='user'?`<div class="user-message">${escape(m.text)}</div>`:m.error?`<div class="error-message">${icon('bulb')}<div><strong>Couldn’t finish this explanation</strong><p>${escape(m.text)}</p><button class="text-button" id="retry">Try again</button></div></div>`:`<article class="assistant-message"><div class="message-label">${icon('spark')} Codex · AI suggestion ${m.cached?'<span>Saved answer · no new usage</span>':''}${m.citations?`<span>${m.citations.valid} source links checked${m.citations.invalid?` · ${m.citations.invalid} unverified removed`:''}</span>`:''}</div>${m.historical?'<p class="notice">Saved from an earlier source revision. Recheck the current code.</p>':''}<div class="markdown">${markdown(m.text)}</div>${coachingMarkup(m.coaching,messageIndex,{message:{...m,historical:m.historical||state.stale},files:state.project.files,records:loadEvidence(localStorage,state.project.id)})}${m.coaching===null?'<p class="panel-note">This answer did not include structured evidence. Its source links are still available for checking.</p>':''}</article>`).join('');
  const retry=$('#retry');if(retry)retry.onclick=()=>{state.history=state.history.filter(m=>!m.error);ask();};
  bindEvidence(target);bindCoaching(target);target.scrollTop=target.scrollHeight;
}
function bindEvidence(target){target.querySelectorAll('a').forEach(a=>{
  const href=a.getAttribute('href')||'';
  if(href.startsWith('atlas:'))a.onclick=safe(async e=>{e.preventDefault();const url=new URL(href);const file=url.searchParams.get('path');const line=Number(url.searchParams.get('line'));if(!state.project.files.some(f=>f.path===file&&Number.isInteger(line)&&line>=1&&line<=f.lines)){notify('This citation is outside the readable index.');return;}await openFile(file,{line:Number.isFinite(line)?line:1,preserveConversation:true});});
  else{a.target='_blank';a.rel='noopener noreferrer';}
});}

function locationRecord(){return {path:state.file?.path,symbolId:state.symbol?.id||'',name:state.symbol?.name||state.file?.path?.split('/').pop(),line:state.selectedLine||state.symbol?.line||1,why:state.arrivalReason,featureContext:state.activeFeature};}
async function openFile(file,{push=true,symbolId='',line=null,preserveConversation=false,keepDiff=false,why='Opened source',featureContext=false}={}) {
  if(!file)return;
  const sequence=++fileSequence;
  cancelExplanation();
  const data=await api('/api/file?path='+encodeURIComponent(file));
  if(sequence!==fileSequence)return;
  if(push&&state.file){state.navigation.push(locationRecord());state.forward=[];}
  if(!keepDiff)state.diff=null;state.range=null;
  state.activeFeature=featureContext;if(!featureContext&&state.journey?.label?.startsWith('Feature: '))state.journey=null;
  state.arrivalReason=why;state.testEvidence=null;state.verification=null;
  state.file=data;state.stale=!!data.stale;state.symbol=state.project.symbols.find(s=>s.id===symbolId)||null;state.selectedLine=line;state.view=state.mode==='recommend'?'recommendations':state.mode==='review'||state.mode==='practice'?'review':'code';
  if(state.mode==='overview')state.mode='explain';
  if(!preserveConversation)state.history=[];
  renderMain();renderTree();
  if(line)$('#source').querySelector(`[data-line="${line}"]`)?.scrollIntoView({block:'center'});
  if(!preserveConversation)scheduleExplanation();
}

function showThinking(text){
  const target=$('#conversation');if(!target)return;
  target.querySelector('.guide-empty')?.remove();$('#thinking')?.remove();
  target.insertAdjacentHTML('beforeend',`<div id="thinking" class="thinking"><span class="spinner"></span><span>${escape(text)}</span></div>`);
  target.scrollTop=target.scrollHeight;
}
function scheduleExplanation(){
  clearTimeout(autoTimer);
  if(!state.auto)return;
  showThinking('Preparing an explanation for your selection…');setBusy(true);
  autoTimer=setTimeout(()=>{setBusy(false);ask();},700);
}

function cancelExplanation(){workSequence++;const pending=!!$('#thinking');clearTimeout(autoTimer);state.controller?.abort();state.controller=null;state.busy=false;setBusy(false);if(pending)renderConversation();}
function setBusy(value){
  if($('#send'))$('#send').disabled=value;
  if($('#stop'))$('#stop').hidden=!value;
  if(!value){$('#thinking')?.remove();if($('#ask-hint'))$('#ask-hint').textContent='Uses Codex allowance · no API key';}
}
async function ask(question='') {
  if(state.busy)return;
  if(!state.project)return;
  if(state.stale){notify('Source changed. Refresh the index before requesting an explanation.');return;}
  if(!state.file&&!state.diff&&state.mode!=='overview'){notify('Choose a source file first.');return;}
  if(state.mode==='recommend'&&state.comparison){const c=state.comparison,f=state.project.files.find(f=>f.path===c.path);if(!f||!Number.isInteger(c.line)||c.line<1||c.line>f.lines){notify('Choose a project file and a valid comparison line first.');return;}}
  clearTimeout(autoTimer);
  const lessonQuestion=[...state.history].reverse().find(m=>m.coaching?.lesson)?.coaching.lesson.question||'';
  const isHint=/^give me (?:a )?(?:small )?hint/i.test(question);
  const previous=state.history.filter(m=>!m.error).slice(-6).map(m=>({role:m.role,text:m.text.slice(0,4000)}));
  if(question)state.history.push({role:'user',text:question});
  state.busy=true;const controller=new AbortController();state.controller=controller;
  renderConversation();setBusy(true);if($('#question'))$('#question').value='';
  showThinking('Connecting to your Codex…');
  try{
    const res=await fetch('/api/explain',{method:'POST',headers:{'Content-Type':'application/json','X-Atlas-Token':state.token},signal:controller.signal,body:JSON.stringify({revision:state.project.revision,mode:state.mode,file:state.mode==='overview'?'':state.file?.path||'',selection:state.mode==='overview'?'':state.symbol?.id||'',range:state.mode==='overview'?null:state.range,depth:state.depth,diff:state.mode!=='overview'&&state.diff?{path:state.diff.path,scope:state.diff.scope,hash:state.diff.hash}:null,structured:true,comparison:state.mode==='recommend'?state.comparison:null,verification:state.verification,feature:state.activeFeature&&state.mode==='flow'&&state.feature?{query:state.feature.query}:null,learning:state.mode==='teachback'?{...learningContext(state.learning,state.concept),answer:isHint?'':question,question:lessonQuestion}:null,question,history:previous})});
    if(!res.ok){const data=await res.json();throw new Error(data.error);}
    const reader=res.body.getReader(),decoder=new TextDecoder();let buffer='',received=false;
    while(true){
      const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});
      let nl;
      while((nl=buffer.indexOf('\n'))>=0){const raw=buffer.slice(0,nl);buffer=buffer.slice(nl+1);if(!raw.trim())continue;const event=JSON.parse(raw);
        if(controller!==state.controller)return;
        if(event.type==='progress'&&$('#thinking span:last-child'))$('#thinking span:last-child').textContent=event.text;
        if(event.type==='error')throw new Error(event.text);
        if(event.type==='answer'){received=true;state.history.push({role:'assistant',text:event.text,cached:event.cached,citations:event.citations,coaching:event.coaching,evidence:event.evidence,dependencies:event.dependencies,freshness:event.freshness,staleDependencies:event.staleDependencies,createdAt:event.createdAt,revision:event.revision});if(state.file)state.read.add(state.file.path);renderConversation();renderTree();if(state.mode==='practice'&&question)savePractice(question,event.text);if(state.mode==='teachback'&&question&&!isHint&&event.coaching?.lesson){const lesson=event.coaching.lesson;state.learning=recordAttempt(state.learning,{...lesson,assessmentSource:'ai',language:state.file?.language,conceptId:['javascript','typescript'].includes(state.file?.language)?matchConcept(lesson.concept)?.id:'',question:lessonQuestion,answer:question,path:state.file?.path,symbol:state.symbol?.id,revision:state.project.revision});persistLearning();}if(event.cacheWarning)notify(event.cacheWarning);}
      }
    }
    if(!received)throw new Error('The connection ended before Codex returned an answer. Try again.');
  }catch(error){if(error.name!=='AbortError'&&controller===state.controller){state.history.push({role:'assistant',text:error.message,error:true});renderConversation();}}
  finally{if(controller===state.controller){state.busy=false;state.controller=null;setBusy(false);}}
}

async function openProject(input){
  fileSequence++;cancelExplanation();notify('Reading the project structure…');
  state.project=await api('/api/project',{method:'POST',body:JSON.stringify(input)});state.comparison=null;
  state.file=null;state.symbol=null;state.range=null;state.diff=null;state.journey=null;state.stale=false;state.indexStale=false;state.history=[];state.read=new Set();state.navigation=[];state.forward=[];state.notebook=readNotebook(localStorage,state.project.id);state.learning=loadLearning(localStorage,state.project.id);state.feature=null;state.verification=null;state.testEvidence=null;state.view='overview';state.mode='explain';state.filter='';$('#file-search').value='';
  if(input.path)localStorage.setItem('atlas-last-path',input.path);
  updateProjectChrome();renderMain();$('#folder-dialog').close();notify(`Opened ${state.project.name}. Choose a starting point.`);
}
async function refreshProject(){
  if(!state.project)return;cancelExplanation();
  const current=state.file?.path;state.project=await api('/api/refresh',{method:'POST',body:'{}'});resetSelectionInsights();state.feature=null;state.history=[];state.symbol=null;state.range=null;state.diff=null;state.journey=null;state.stale=false;state.indexStale=false;
  if(current&&state.project.files.some(f=>f.path===current))state.file=await api('/api/file?path='+encodeURIComponent(current));else state.file=null;
  updateProjectChrome();renderMain();notify('Project index refreshed. Explanations will use the current source.');
}

async function folderDialog(dir){
  const dialog=$('#folder-dialog'),sequence=++folderSequence;
  let pickerController=null;
  if(!dialog.open)dialog.showModal();
  dialog.innerHTML=`<div class="dialog-header"><div><h2 id="folder-title">Open a project</h2><p>Choose a folder on this computer.</p></div><button class="icon-button" id="close-dialog" aria-label="Close folder picker">${icon('close')}</button></div>${state.nativeFolderPicker?`<div class="native-folder-choice"><button class="primary" id="choose-native-folder">${icon('folder')} Choose a folder</button><p id="native-folder-status" role="status">Browse your computer and select the project folder.</p></div>`:''}<form id="path-form"><label for="folder-path">${state.nativeFolderPicker?'Or enter a folder path':'Folder path'}</label><div class="path-row"><input id="folder-path" placeholder="Enter the full project folder path" value="${escape(dir||localStorage.getItem('atlas-last-path')||'')}"><button class="secondary" type="submit">Open</button></div></form><div id="folder-list" class="folder-list"><p>Loading folders…</p></div><div class="dialog-footer"><span>Ignored files, hidden files, and symlinks are skipped.</span><button class="text-button" id="use-example">Use the example project</button></div>`;
  $('#close-dialog').onclick=()=>dialog.close();
  const disableControls=disabled=>dialog.querySelectorAll('button:not(#close-dialog),input').forEach(control=>{control.disabled=disabled;});
  if($('#choose-native-folder'))$('#choose-native-folder').onclick=async()=>{
    if(pickerController)return;
    const controller=new AbortController();pickerController=controller;
    const cancel=()=>controller.abort();
    dialog.addEventListener('close',cancel,{once:true});disableControls(true);
    $('#native-folder-status').textContent='Choose a folder in the system window…';
    try {
      const selected=await api('/api/folder-picker',{method:'POST',body:'{}',signal:controller.signal});
      if(controller.signal.aborted||!dialog.open||sequence!==folderSequence)return;
      if(selected.cancelled){$('#native-folder-status').textContent='Selection cancelled. Choose a folder when you are ready.';return;}
      $('#folder-path').value=selected.path;
      $('#native-folder-status').textContent='Reading the selected project…';
      await openProject({path:selected.path});
    } catch(error) {
      if(!controller.signal.aborted&&dialog.open&&sequence===folderSequence)$('#native-folder-status').textContent=error.message;
    } finally {
      dialog.removeEventListener('close',cancel);pickerController=null;
      if(dialog.open&&sequence===folderSequence)disableControls(false);
    }
  };
  $('#path-form').onsubmit=e=>{e.preventDefault();safe(()=>openProject({path:$('#folder-path').value.trim()}))();};
  $('#use-example').onclick=safe(()=>openProject({demo:true}));
  try{
    const data=await api('/api/browse'+(dir?'?dir='+encodeURIComponent(dir):''));
    if(!dialog.open||sequence!==folderSequence)return;
    $('#folder-list').innerHTML=`<div class="browser-path"><button class="icon-button" id="parent-folder" aria-label="Parent folder">${icon('back')}</button><span>${escape(data.path)}</span><button class="text-button" id="select-folder">Open this folder</button></div>${data.folders.map(f=>`<button class="folder-row" data-folder="${escape(f.path)}">${icon('folder')}<span>${escape(f.name)}</span>${icon('chevron')}</button>`).join('')||'<p class="tree-empty">No subfolders.</p>'}`;
    $('#parent-folder').onclick=safe(()=>folderDialog(data.parent));$('#select-folder').onclick=safe(()=>openProject({path:data.path}));
    document.querySelectorAll('[data-folder]').forEach(b=>b.onclick=safe(()=>folderDialog(b.dataset.folder)));
    if(pickerController)disableControls(true);
  }catch(e){if(dialog.open&&sequence===folderSequence)$('#folder-list').innerHTML=`<p class="notice">${escape(e.message)}</p>`;}
}

async function init(){
  shell();renderWelcome();
  try{const session=await fetch('/api/session').then(r=>r.json());state.token=session.token;state.nativeFolderPicker=Boolean(session.nativeFolderPicker);await Promise.all([updateStatus(),loadThemes()]);const p=await api('/api/project');if(p){state.project=p;state.notebook=readNotebook(localStorage,p.id);state.learning=loadLearning(localStorage,p.id);updateProjectChrome();renderMain();}else{const last=localStorage.getItem('atlas-last-path');if(last)await openProject({path:last});}}catch(e){notify('Cannot reach the local server. Start Code Atlas, then reload.');}
  window.addEventListener('focus',()=>{if((localStorage.getItem('atlas-theme')||'vscode')==='vscode')loadThemes();checkFreshness();});
}
init();

function renderReaderTools(){
 const el=$('#reader-tools');if(!el)return;
 el.innerHTML=`<label>Explanation <select id="depth" aria-label="Explanation depth"><option value="brief">Quick summary</option><option value="normal">Beginner guide</option><option value="syntax">Line by line / syntax</option></select></label><button class="small-action" id="build-journey">${icon('flow')} Reading path</button><button class="small-action" id="peek-selection">Peek definition</button><button class="small-action" id="test-evidence">Test evidence</button><button class="small-action" id="explain-line">Explain selected line</button><label><input type="checkbox" id="focus-code" ${state.focusCode?'checked':''}> Focus code</label><button class="small-action" id="save-note">${icon('book')} Save / note</button>${state.diff?'<button class="small-action" id="back-changes">All changes</button>':''}${state.stale?'<strong class="stale-label">Source changed — refresh required</strong>':'<span class="tools-hint">Click calls to jump · Alt-click to preview · Shift-click for a range</span>'}`;
 $('#depth').value=state.depth;$('#depth').onchange=e=>{cancelExplanation();state.depth=e.target.value;};
 $('#build-journey').onclick=safe(async()=>{if(!state.file)return notify('Choose a source file first.');const source=state.file.path,projectId=state.project.id;const journey=await api('/api/journey?file='+encodeURIComponent(source)+'&selection='+encodeURIComponent(state.symbol?.id||''));if(state.file?.path===source&&state.project.id===projectId){state.journey=journey;state.journeyOpen=true;renderJourney();}});
 $('#explain-line').onclick=()=>{if(!state.file||state.diff)return notify('Choose a source line first.');cancelExplanation();const n=state.selectedLine||state.symbol?.line||1;state.range={start:n,end:n};state.symbol=null;state.depth='syntax';state.mode='explain';state.view='code';state.history=[];resetSelectionInsights();renderMain();ask();};
 $('#focus-code').onchange=e=>{state.focusCode=e.target.checked;$('#source')?.classList.toggle('focus-code',state.focusCode);};
 $('#save-note').onclick=noteDialog;
 $('#peek-selection').onclick=safe(()=>state.file?peekDefinition(state.symbol||{path:state.file.path,line:state.selectedLine||1,name:'Selected source'}):notify('Choose source first.'));
 $('#test-evidence').onclick=safe(loadTestEvidence);
 if($('#back-changes'))$('#back-changes').onclick=()=>{cancelExplanation();state.view='changes';renderMain();};
 const area=$('.ask-area');if(['practice','teachback'].includes(state.mode)&&area&&!$('#practice-controls'))area.insertAdjacentHTML('afterbegin',`<div id="practice-controls" class="practice-controls"><label>My confidence <select id="confidence" aria-label="Prediction confidence"><option>Unsure</option><option>Somewhat confident</option><option>Very confident</option></select></label><button id="request-hint" class="text-button">Give me a hint</button></div>`);
 if($('#request-hint'))$('#request-hint').onclick=()=>ask('Give me a small hint without revealing the answer.');
}
function renderJourney(){
 const el=$('#journey-panel');if(!el)return;const journey=state.journey;if(!journey){el.innerHTML='';return;}
 el.innerHTML=`<details class="journey-details" ${state.journeyOpen||state.mode==='flow'?'open':''}><summary>${escape(journey.label)}</summary><div class="journey-strip">${journey.stops.map((s,i)=>`<button class="path-stop ${state.file?.path===s.path?'current':''}" data-hop="${i}" title="${escape(s.reason)}"><small>${i+1} · ${escape(s.via)}</small><strong>${escape(s.name||s.path.split('/').pop())}</strong><span>${escape(s.path)}</span></button>`).join('')}</div><p>${journey.limited?`Showing ${journey.stops.length} suggested stops. `:''}${journey.boundaries.length?`${journey.boundaries.length} effect candidates need inspection: ${escape(journey.boundaries.slice(0,4).map(b=>b.name).join(', '))}. `:''}Imports are context links. Network and database behavior is not executed.</p></details>`;
 el.querySelectorAll('[data-hop]').forEach(b=>b.onclick=safe(()=>{const hop=journey.stops[Number(b.dataset.hop)];return openFile(hop.path,{symbolId:hop.symbol,line:hop.line,featureContext:state.activeFeature});}));
}
function renderExplore(){
 $('#main').innerHTML=`<div class="overview-scroll"><div class="heading-row"><div><h1>Find your way through the code.</h1><p>Look for a behavior, symbol, filename, or exact phrase.</p></div></div><form class="explore-search" id="explore-form"><select id="search-kind" aria-label="Search type"><option value="symbols">Functions & classes</option><option value="files">Files</option><option value="text">Source text</option></select><input id="search-query" aria-label="Search repository" placeholder="For example: campaign, validate, POST…" maxlength="120" value="${escape(state.searchQuery)}"><button class="primary">Search</button></form><div id="search-results"></div><section class="entries-section"><div class="section-title"><h2>Entry candidates</h2><select id="entry-kind" aria-label="Entry point type"><option value="all">All entry types</option><option value="page">Pages</option><option value="api">API requests</option><option value="startup">Startup / exports</option></select><input id="entry-filter" aria-label="Filter entry points" placeholder="Filter entry paths…"></div><div id="entry-results"></div></section></div>`;
 $('#search-kind').value=state.searchKind;
 $('#explore-form').onsubmit=async e=>{e.preventDefault();state.searchKind=$('#search-kind').value;state.searchQuery=$('#search-query').value;const target=$('#search-results');target.textContent='Searching the local source…';try{const data=await api('/api/search?kind='+state.searchKind+'&q='+encodeURIComponent(state.searchQuery));if(target!==$('#search-results'))return;target.innerHTML=`<p>${data.results.length} results${data.limited?' · showing a bounded selection':''}</p><div class="result-list">${data.results.map(r=>`<button data-result-path="${escape(r.path)}" data-result-line="${r.line}" data-result-symbol="${escape(r.symbol||'')}"><strong>${escape(r.label)}</strong><span>${escape(r.path)}:${r.line} · ${escape(r.kind)}</span></button>`).join('')||'<p>No matches. Try a shorter identifier or search source text.</p>'}</div>`;target.querySelectorAll('[data-result-path]').forEach(b=>b.onclick=safe(()=>openFile(b.dataset.resultPath,{symbolId:b.dataset.resultSymbol,line:Number(b.dataset.resultLine)})));}catch(error){target.textContent=error.message;}};
 const entries=()=>{const query=$('#entry-filter').value.toLowerCase(),kind=$('#entry-kind').value;const found=state.project.entries.filter(e=>(kind==='all'||e.kind===kind)&&e.path.toLowerCase().includes(query));$('#entry-results').innerHTML=`<p>${found.length} candidates · ${found.length>60?'first 60 shown · ':''}identified by file conventions</p><div class="result-list">${found.slice(0,60).map(e=>`<button data-entry="${escape(e.path)}"><strong>${escape(e.path)}</strong><span>${escape(e.reason)}</span></button>`).join('')}</div>`;document.querySelectorAll('[data-entry]').forEach(b=>b.onclick=safe(()=>openFile(b.dataset.entry)));};
 $('#entry-filter').oninput=entries;$('#entry-kind').onchange=entries;entries();
}
async function renderChanges(){
 $('#main').innerHTML=`<div class="overview-scroll"><div class="heading-row"><div><h1>Review what changed.</h1><p>Compare behavior before and after. Build your own review, then ask Codex.</p></div></div><div class="change-toolbar"><label>Compare <select id="change-scope" aria-label="Change scope"><option value="working">Working tree against HEAD</option><option value="staged">Staged changes</option><option value="unstaged">Unstaged + untracked</option></select></label><button class="secondary" id="reload-changes">Reload changes</button></div><div class="review-checklist"><strong>A review in five questions</strong><ol><li>What should this change do?</li><li>Where does input come from, and who may use it?</li><li>What happens with invalid input or a failed dependency?</li><li>Could retries or concurrency break a rule?</li><li>What test would demonstrate the expected behavior?</li></ol></div><div id="changes-results">Reading local Git changes…</div></div>`;
 $('#change-scope').value=state.scope;$('#change-scope').onchange=e=>{state.scope=e.target.value;renderChanges();};$('#reload-changes').onclick=()=>renderChanges();const target=$('#changes-results');
 try{const data=await api('/api/changes?scope='+state.scope);if(target!==$('#changes-results'))return;state.changes=data;
 target.innerHTML=!data.available?`<p class="notice">${escape(data.reason)}</p>`:`<p>${data.files.length} readable changed files${data.limited?' · first 300 shown':''}. Hidden, ignored, and unsupported files are omitted.</p><div class="result-list">${data.files.map(f=>`<button data-change="${escape(f.path)}"><strong><span class="change-badge">${escape(f.status)}</span> ${escape(f.path)}</strong><span>${f.status==='D'?'Deleted file':f.status==='?'?'Untracked file':'Inspect the diff and its surrounding source'}</span></button>`).join('')||'<p>No readable changes in this comparison.</p>'}</div>`;
 target.querySelectorAll('[data-change]').forEach(b=>b.onclick=safe(()=>openDiff(b.dataset.change)));
 }catch(e){if(target===$('#changes-results'))target.textContent=e.message;}
}
async function openDiff(file){
 cancelExplanation();const sequence=++fileSequence;const diff=await api('/api/diff?scope='+state.scope+'&file='+encodeURIComponent(file));
 const source=state.project.files.some(f=>f.path===file)?await api('/api/file?path='+encodeURIComponent(file)):null;if(sequence!==fileSequence)return;
 state.mode='review';state.history=[];state.symbol=null;state.range=null;state.journey=null;state.file=source;
 state.diff=diff;state.view='review';renderMain();
}
function renderDiffSource(){
 const diff=state.diff;$('#symbol-bar').innerHTML=`<strong>${escape(diff.path)}</strong><span>${escape(diff.scope)}${diff.limited?' · truncated':''}</span>`;
 $('#source').innerHTML=`<div class="diff-code">${diff.text.split('\n').map(line=>`<div class="diff-line ${line.startsWith('+')?'added':line.startsWith('-')?'removed':line.startsWith('@@')?'hunk':''}">${escape(line)||' '}</div>`).join('')}</div>`;
 $('#connections').innerHTML=`<p>Green: added. Red: removed. This comparison is read-only. Other source context comes from the working tree, which may differ from a staged version.</p>${state.file?'<button class="text-button" id="view-full-source">Open current source</button>':'<p>The file is deleted. Old lines are available only in this diff.</p>'}`;
 if($('#view-full-source'))$('#view-full-source').onclick=safe(()=>openFile(state.file.path));
}
function persistNotebook(){if(!writeNotebook(localStorage,state.project.id,state.notebook))notify('Browser storage is full. Export your notebook to preserve it.');}
function savePractice(attempt,answer){if(/hint/i.test(attempt))return;state.notebook.push({path:state.file?.path||state.diff?.path||'',line:state.range?.start||state.symbol?.line||1,revision:state.project.revision,date:new Date().toISOString(),attempt,answer,confidence:$('#confidence')?.value||'Not recorded',note:'Practice attempt — assess the feedback yourself.'});persistNotebook();}
function noteDialog(){
 const dialog=$('#folder-dialog');const answer=[...state.history].reverse().find(m=>m.role==='assistant'&&!m.error)?.text||'';dialog.innerHTML=`<div class="dialog-header"><div><h2 id="folder-title">Keep what you learned.</h2><p>Saved in this browser, linked to this source revision.</p></div><button class="icon-button" id="close-note" aria-label="Close note">${icon('close')}</button></div><form id="note-form" class="note-form"><label>My observation, question, or concept<textarea id="note-text" aria-label="Learning note" rows="5" maxlength="6000" placeholder="In my own words, this function…"></textarea></label><label><input id="include-answer" type="checkbox" checked> Include the latest Codex explanation</label><button class="primary" type="submit">Save to notebook</button></form>`;dialog.showModal();$('#close-note').onclick=()=>dialog.close();$('#note-form').onsubmit=e=>{e.preventDefault();const note=$('#note-text').value.trim();if(!note&&!answer)return notify('Write a note or generate an explanation first.');state.notebook.push({path:state.file?.path||state.diff?.path||'Project overview',line:state.range?.start||state.symbol?.line||1,revision:state.project.revision,date:new Date().toISOString(),note,answer:$('#include-answer').checked?answer:''});persistNotebook();dialog.close();notify('Saved to your learning notebook.');};
}
function renderNotebook(){
 const records=state.notebook;$('#main').innerHTML=`<div class="overview-scroll"><div class="heading-row"><div><h1>Your learning notebook.</h1><p>${records.length} saved notes and attempts. Progress is practice, not a mastery score.</p></div><button class="secondary" id="export-notebook">Export Markdown</button></div><p class="notice">Stored in this browser on this computer. A new source revision marks earlier notes as historical. Export to keep a portable copy.</p><div class="notebook-list">${records.map((r,i)=>`<details class="notebook-card"><summary><strong>${escape(r.path)}:${r.line||1}</strong><span>${escape(r.attempt?'Practice · '+r.confidence:'Reading note')} · ${isCurrent(r,state.project.revision)?'Current revision':'Historical — verify against current code'}</span><small>${escape(r.note||r.attempt||'Saved explanation').slice(0,150)}</small></summary><div class="notebook-body"><p>${escape(r.note||'')}</p>${r.attempt?`<p><strong>My prediction:</strong> ${escape(r.attempt)}</p>`:''}<div class="markdown">${markdown(r.answer||'')}</div><div class="notebook-actions"><button class="text-button" data-note-source="${i}">Open current source</button><button class="text-button" data-remove-note="${i}">Remove this note</button></div></div></details>`).join('')||'<div class="guide-empty"><h2>Start with one observation.</h2><p>Open a function, make a prediction in Practice, or save an explanation with your own note.</p></div>'}</div></div>`;
 $('#export-notebook').onclick=()=>exportDialog(exportNotebook(state.project.name,records));
 document.querySelectorAll('[data-note-source]').forEach(b=>b.onclick=safe(()=>{const r=records[Number(b.dataset.noteSource)];if(!state.project.files.some(f=>f.path===r.path))return notify('This source is not in the current index.');state.mode='explain';return openFile(r.path,{line:r.line,preserveConversation:!!r.answer}).then(()=>{if(r.answer){state.history=[{role:'assistant',text:r.answer,cached:true,historical:!isCurrent(r,state.project.revision)}];renderConversation();}});}));
 document.querySelectorAll('[data-remove-note]').forEach(b=>b.onclick=()=>{records.splice(Number(b.dataset.removeNote),1);persistNotebook();renderNotebook();});bindEvidence($('#main'));
}
let freshnessPending=false,lastFreshness=0;
async function checkFreshness(){
 if(!state.project||state.busy||freshnessPending||Date.now()-lastFreshness<15000)return;
 freshnessPending=true;const id=state.project.id;
 try{
  const result=await api('/api/freshness');if(state.project?.id!==id)return;
  state.indexStale=result.stale;state.stale=result.stale&&(Array.isArray(result.changedFiles)?result.changedFiles.includes(state.file?.path):true);
  if(result.stale){
   notify(state.stale?'Selected source changed. Refresh before explaining it.':'Project files changed. Unaffected explanations remain reusable; refresh to update navigation.');
  }
  // Staged Git context can change without changing any working-tree file.
  if(state.history.some(m=>m.dependencies)){
   const {answers}=await api('/api/answers');if(state.project?.id!==id)return;
   for(const m of state.history.filter(m=>m.dependencies)){
    const saved=answers.find(a=>a.createdAt===m.createdAt&&a.dependencies?.fingerprint===m.dependencies.fingerprint&&a.text===m.text);
    m.freshness=saved?.freshness||'unknown';m.historical=m.freshness!=='current';
   }
  }
  renderReaderTools();if($('#conversation'))renderConversation();
 }catch{}finally{freshnessPending=false;lastFreshness=Date.now();}
}

function exportDialog(text){
 const dialog=$('#folder-dialog'),url=URL.createObjectURL(new Blob([text],{type:'text/markdown'}));
 dialog.innerHTML=`<div class="dialog-header"><div><h2 id="folder-title">Export your notebook</h2><p>Download Markdown, or copy the text in browsers without downloads.</p></div><button class="icon-button" id="close-export" aria-label="Close export">${icon('close')}</button></div><div class="note-form"><textarea class="export-text" id="export-text" aria-label="Notebook Markdown" readonly rows="12">${escape(text)}</textarea><div class="notebook-actions"><a class="primary" href="${url}" download="code-atlas-notebook.md">Download Markdown</a><button class="secondary" id="copy-export">Copy Markdown</button></div></div>`;
 dialog.showModal();$('#close-export').onclick=()=>dialog.close();dialog.addEventListener('close',()=>URL.revokeObjectURL(url),{once:true});
 $('#copy-export').onclick=safe(async()=>{try{await navigator.clipboard.writeText(text);notify('Notebook Markdown copied.');}catch{$('#export-text').select();notify('Text selected. Press Command+C or Control+C to copy.');}});
}

function renderTrail(){
 const el=$('#reading-trail');if(!el||!state.file)return;
 const records=[...state.navigation.slice(-5),locationRecord()];
 el.innerHTML=`<span>Reading trail</span>${records.map((r,i)=>i===records.length-1?`<strong title="${escape(r.why)}">${escape(r.name||r.path)}</strong>`:`<button data-trail="${i}" title="${escape(r.why||'Opened source')} · ${escape(r.path)}:${r.line||1}">${escape(r.name||r.path)} · ${escape(r.path?.split('/').pop())}</button><span>›</span>`).join('')}`;
 el.querySelectorAll('[data-trail]').forEach(b=>b.onclick=safe(()=>openFile(records[Number(b.dataset.trail)].path,{...records[Number(b.dataset.trail)],why:'Returned through reading trail'})));
}
async function peekDefinition(target){
 if(!target?.path)return;
 let dialog=$('#peek-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='peek-dialog';dialog.className='peek-dialog';document.body.append(dialog);}
 const sequence=++state.peekSequence,projectId=state.project.id;
 dialog.innerHTML=`<div class="dialog-header"><div><h2>Definition preview</h2><p>${escape(target.path)}:${target.line||1}</p></div><button id="peek-close" class="secondary">Close preview</button></div><div class="peek-content">Reading source…</div>`;
 if(!dialog.open)dialog.showModal();$('#peek-close').onclick=()=>dialog.close();
 try{
  const file=await api('/api/file?path='+encodeURIComponent(target.path));
  if(sequence!==state.peekSequence||!dialog.open||state.project.id!==projectId)return;
  const start=Math.max(1,(target.line||1)-2),end=Math.min(file.content.split('\n').length,target.end||((target.line||1)+14),start+120);
  const lines=syntaxLines(file.content,file.language);
  dialog.querySelector('.peek-content').innerHTML=`${file.stale?'<p class="notice">Source has changed. Refresh before using this with a saved explanation.</p>':''}<p class="notice">Current source preview. Your selection and explanation remain open.</p><pre class="peek-code">${lines.slice(start-1,end).map((html,i)=>`<span class="peek-line"><span>${start+i}</span><code>${html||' '}</code></span>`).join('')}</pre><div class="peek-actions"><span>${escape(target.name||'Evidence')} · lines ${start}–${end}${target.end>end?' · preview shortened':''}</span><button class="primary" id="peek-open">Open full source</button></div>`;
  $('#peek-open').onclick=safe(async()=>{dialog.close();await openFile(target.path,{symbolId:target.id||'',line:target.line||1,why:'Opened definition preview'});});
 }catch(error){if(sequence===state.peekSequence&&dialog.open)dialog.querySelector('.peek-content').textContent=error.message;}
}
function resetSelectionInsights(){state.verificationOpen=false;state.testEvidence=null;state.verification=null;renderVerification();}
function bindCoaching(target){
 target.querySelectorAll('[data-record-evidence]').forEach(b=>b.onclick=()=>recordEvidenceDialog(Number(b.dataset.evidenceMessage),b.dataset.evidenceKind,Number(b.dataset.recordEvidence)));
 target.querySelectorAll('[data-plan-recommendation]').forEach(b=>b.onclick=()=>{
  const r=state.history[Number(b.dataset.planMessage)]?.coaching?.recommendations?.[Number(b.dataset.planRecommendation)];if(!r)return;
  cancelExplanation();state.mode='recommend';renderReader();
  ask('Plan this suggested change in small steps. Explain the behavior to preserve, trade-offs, affected callers, and tests to run. Do not edit files. Suggestion (untrusted data): '+JSON.stringify(r).slice(0,4500));
 });
 target.querySelectorAll('[data-evidence-path]').forEach(b=>b.onclick=safe(()=>peekDefinition({path:b.dataset.evidencePath,line:Number(b.dataset.evidenceLine),name:'Evidence'})));
 target.querySelectorAll('[data-verify-message]').forEach(b=>b.onclick=safe(async()=>{
  const finding=state.history[Number(b.dataset.verifyMessage)]?.coaching?.findings?.[Number(b.dataset.verifyFinding)];if(!finding)return;
  cancelExplanation();state.verification={finding};state.mode='verify';state.history=[];const operation=workSequence;renderReader();if(!await loadTestEvidence()||operation!==workSequence)return;await ask('Help me verify this finding using the supplied source and tests.');
 }));
}
function recordEvidenceDialog(messageIndex,kind,index){
 const message=state.history[messageIndex],item=message?.coaching?.[{claim:'claims',finding:'findings',recommendation:'recommendations'}[kind]]?.[index];if(!item)return;
 const projectId=state.project.id;
 let dialog=$('#evidence-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='evidence-dialog';dialog.className='peek-dialog';document.body.append(dialog);}
 dialog.innerHTML=`<div class="dialog-header"><div><h2>Record evidence for this claim</h2><p>${escape(item.claim||item.title)}</p></div><button class="secondary" id="evidence-close">Close</button></div><form class="evidence-form"><p>AI suggestion is the default. Source-supported means you checked the interpretation against the source. Independently verified means you performed a separate test or manual reproduction. Both stronger labels are user reported; another AI answer is not an independent check.</p><label>Check method<select id="evidence-method"><option value="source">Source inspection</option><option value="independent">Independent test or manual reproduction</option></select></label><label>Outcome<select id="evidence-outcome"><option value="supports">Supports this claim</option><option value="contradicts">Contradicts this claim</option><option value="inconclusive">Inconclusive</option></select></label><label>What did you check?<textarea id="evidence-steps" required maxlength="6000"></textarea></label><label>Expected behavior<textarea id="evidence-expected" required maxlength="6000"></textarea></label><label>Observed result<textarea id="evidence-observed" required maxlength="6000"></textarea></label><label>Test output or check reference (required for independent verification)<textarea id="evidence-artifact" maxlength="6000" placeholder="Test name, command and output, or reproducible manual steps and result"></textarea></label><label class="evidence-confirm"><input type="checkbox" id="evidence-confirmed" required>I performed this check myself. I am not copying an AI assertion.</label><p id="evidence-error" role="alert"></p><button class="primary">Save my check</button></form>`;
 $('#evidence-close').onclick=()=>dialog.close();
 dialog.querySelector('form').onsubmit=async e=>{
  e.preventDefault();const submit=dialog.querySelector('form button');submit.disabled=true;try{
   if(state.project.id!==projectId)throw new Error('The project changed. Reopen this claim.');
   if(message.dependencies){
    const {answers}=await api('/api/answers');
    const saved=answers.find(a=>a.createdAt===message.createdAt&&a.dependencies?.fingerprint===message.dependencies.fingerprint&&a.text===message.text);
    if(!saved||saved.freshness!=='current')throw new Error('The supporting context is no longer current or could not be rechecked. Refresh and generate a current answer.');
   }else if((await api('/api/freshness')).stale)throw new Error('This older answer needs a fresh source check. Refresh and generate a current answer.');
   if(!dialog.open)return;
   if(state.project.id!==projectId)throw new Error('The project changed. Reopen this claim.');
   const rows=recordEvidence(loadEvidence(localStorage,projectId),{kind,item,message:{...message,historical:message.historical||state.stale},method:$('#evidence-method').value,outcome:$('#evidence-outcome').value,steps:$('#evidence-steps').value,expected:$('#evidence-expected').value,observed:$('#evidence-observed').value,artifact:$('#evidence-artifact').value,confirmed:$('#evidence-confirmed').checked},state.project.files);
   if(!saveEvidence(localStorage,projectId,rows))throw new Error('Browser storage is full. Copy this check before leaving.');
   dialog.close();renderConversation();notify('Check saved as user reported, for this claim and its supporting source.');
  }catch(error){if(dialog.open)$('#evidence-error').textContent=error.message;}finally{submit.disabled=false;}
 };
 dialog.showModal();
}
async function loadTestEvidence(){
 if(!state.file){notify('Choose a current source file first.');return false;}
 const file=state.file.path,symbol=state.symbol?.id||'',projectId=state.project.id;
 const panel=$('#verification-panel');if(panel)panel.innerHTML='<p class="panel-note">Finding related tests and callers…</p>';
 let result;try{result=await api('/api/test-evidence?file='+encodeURIComponent(file)+'&selection='+encodeURIComponent(symbol));}catch(error){if(panel===$('#verification-panel'))panel.textContent=error.message;throw error;}
 if(state.file?.path!==file||state.symbol?.id!== (symbol||undefined)||state.project.id!==projectId)return false;
 state.testEvidence=result;state.verificationOpen=true;renderVerification();return true;
}
function verificationRecords(){try{const rows=JSON.parse(localStorage.getItem('atlas-verifications-'+state.project.id)||'[]');return Array.isArray(rows)?rows.slice(-100):[];}catch{return [];}}
function renderVerification(){
 const el=$('#verification-panel');if(!el)return;
 const data=state.testEvidence;
 if(!data){el.innerHTML=state.mode==='verify'?'<p class="panel-note">Use Test evidence to inspect related tests, then ask Codex for a verification plan.</p>':'';return;}
 const finding=state.verification?.finding;
 el.innerHTML=`<details class="verification-panel" ${state.verificationOpen?'open':''}><summary>Verification workspace${finding?' · '+escape(finding.title):''}</summary><p>These are candidate tests and affected callers. No tests have been run.</p><h4>Related tests</h4>${data.tests.length?data.tests.map(t=>`<div class="test-evidence"><button class="text-button" data-evidence-path="${escape(t.path)}" data-evidence-line="${t.line}">${escape(t.path)}:${t.line}</button><small>${escape(t.relationship)} · ${escape(t.reason)}</small></div>`).join(''):'<p>No related tests found. That does not prove the code is untested.</p>'}<h4>Potentially affected callers</h4>${data.affected.length?data.affected.map(t=>`<button class="text-button" data-evidence-path="${escape(t.path)}" data-evidence-line="${t.line}">${escape(t.name)} · ${escape(t.path)}:${t.line}</button>`).join(''):'<p>No direct callers resolved.</p>'}<details><summary>Available test scripts · display only</summary>${data.scripts.map(s=>`<p><code>${escape(s.name)}</code> in ${escape(s.packagePath)}<br><code>${escape(s.command)}</code></p>`).join('')||'<p>No test scripts detected.</p>'}</details><ul>${data.unknowns.map(x=>`<li>${escape(x)}</li>`).join('')}</ul><button class="secondary" id="verify-plan">Ask Codex for a verification plan</button><form id="verification-observation"><label>What did you observe?<select id="verification-result"><option>Needs more evidence</option><option>Reproduced</option><option>Could not reproduce</option></select></label><textarea id="verification-notes" aria-label="Verification observations" placeholder="Steps you tried, actual result, and relevant test output…" maxlength="6000" required></textarea><button class="secondary">Save my observation</button></form><div id="verification-history">${verificationRecords().filter(r=>r.file===state.file?.path).map(r=>`<p><strong>${escape(r.result)} — user reported</strong> · ${escape(r.finding||'Selected code')} · ${r.revision===state.project.revision?'current revision':'historical revision'}<br>${escape(r.notes)}</p>`).join('')}</div></details>`;
 bindCoaching(el);
 $('#verify-plan').onclick=()=>{cancelExplanation();state.mode='verify';state.history=[];renderReader();ask('Build a concrete verification plan, using the actual supplied test excerpts. Identify missing cases.');};
 $('#verification-observation').onsubmit=e=>{e.preventDefault();const rows=verificationRecords();rows.push({file:state.file?.path,symbol:state.symbol?.id||'',range:state.range,revision:state.project.revision,finding:finding?.title||'Selected code',result:$('#verification-result').value,notes:$('#verification-notes').value.trim(),date:new Date().toISOString()});try{localStorage.setItem('atlas-verifications-'+state.project.id,JSON.stringify(rows.slice(-100)));renderVerification();notify('Observation saved as user reported, not automatically verified.');}catch{notify('Browser storage is full. Copy your observation before leaving.');}};
}
function renderFeatures(){
 $('#main').innerHTML=`<div class="overview-scroll"><h1>Follow a feature.</h1><p>Start with a user action. Find likely entry points, trace resolved connections, and stop at unknown boundaries.</p><form id="feature-form" class="explore-search"><input id="feature-query" aria-label="Feature to understand" maxlength="120" placeholder="For example: reverse payout, sign in, create campaign" value="${escape(state.feature?.query||'')}"><button class="primary">Find the feature</button></form><div id="feature-results"></div></div>`;
 let searchSequence=0;
 $('#feature-form').onsubmit=safe(async e=>{e.preventDefault();const query=$('#feature-query').value.trim();if(!query)return;const sequence=++searchSequence,target=$('#feature-results'),projectId=state.project.id;target.textContent='Tracing local relationships…';const result=await api('/api/feature?q='+encodeURIComponent(query));if(target!==$('#feature-results')||state.project.id!==projectId||sequence!==searchSequence)return;state.feature=result;renderFeatureResults();});
 if(state.feature)renderFeatureResults();
}
function renderFeatureResults(){
 const target=$('#feature-results'),f=state.feature;if(!target||!f)return;
 target.innerHTML=`<p class="notice">Static reading suggestions. A filename match is a candidate, and an import is not proof of execution.</p><h2>Likely starting points</h2><div class="result-list">${f.candidates.map((c,i)=>`<button data-feature-candidate="${i}"><strong>${escape(c.name)}</strong><span>${escape(c.path)}:${c.line} · ${escape(c.reason)}</span></button>`).join('')||'<p>No matching feature found. Try a shorter identifier.</p>'}</div><h2>Suggested walkthrough</h2><div class="feature-stops">${f.stops.map((s,i)=>`<button class="path-stop" data-feature-stop="${i}"><small>${i+1} · ${escape(s.via)}</small><strong>${escape(s.name||s.path)}</strong><span>${escape(s.path)}:${s.line}</span><span>${escape(s.reason)}</span></button>`).join('')}</div><h3>Unresolved boundaries</h3>${f.boundaries.map(b=>`<button class="text-button" data-evidence-path="${escape(b.path)}" data-evidence-line="${b.line}">${escape(b.name)} · ${escape(b.path)}:${b.line}</button>`).join('')}<ul>${f.unknowns.map(x=>`<li>${escape(x)}</li>`).join('')}</ul>${f.limited?'<p>Showing a bounded selection. There may be more paths.</p>':''}${f.stops.length?'<button class="primary" id="explain-feature">Explain this walkthrough with Codex</button>':''}`;
 const open=safe(async item=>{state.mode='flow';state.journey={...f,label:'Feature: '+f.query};await openFile(item.path,{symbolId:item.symbol||'',line:item.line,why:'Feature: '+f.query,featureContext:true});});
 target.querySelectorAll('[data-feature-candidate]').forEach(b=>b.onclick=()=>open(f.candidates[Number(b.dataset.featureCandidate)]));target.querySelectorAll('[data-feature-stop]').forEach(b=>b.onclick=()=>open(f.stops[Number(b.dataset.featureStop)]));bindCoaching(target);
 if($('#explain-feature'))$('#explain-feature').onclick=safe(async()=>{cancelExplanation();state.mode='flow';state.journey={...f,label:'Feature: '+f.query};await openFile(f.stops[0].path,{symbolId:f.stops[0].symbol||'',line:f.stops[0].line,preserveConversation:true,why:'Feature: '+f.query,featureContext:true});state.history=[];await ask('Walk me through this feature: '+f.query+'. Mark inferred transitions and unknown boundaries.');});
}
function persistLearning(){if(!saveLearning(localStorage,state.project.id,state.learning))notify('Could not save learning progress. Browser storage may be full.');}
function renderLearning(){
 const suggestion=suggestLesson(state.learning),rows=state.learning;
 const eligible=!suggestion?.language||['javascript','typescript'].includes(suggestion.language);
 const pathEligible=!suggestion?.path||/\.(?:[cm]?[jt]sx?)$/.test(suggestion.path);
 const matched=eligible&&pathEligible?matchConcept(suggestion?.conceptId||suggestion?.concept):null;
 $('#main').innerHTML=`<div class="overview-scroll"><h1>Learn to reason about the code.</h1><p>Explain an unfamiliar function in your own words, then get evidence-based feedback. Assessments are tentative and you can correct them.</p><section class="learning-next"><h2>${suggestion?'Revisit: '+escape(suggestion.concept):'Start with one function'}</h2><p>${suggestion?`Suggested review: ${escape(new Date(suggestion.reviewAt).toLocaleDateString())}. ${escape(suggestion.misconceptions?.[0]||'Try applying the concept to another example.')}`:'Predict its inputs, outputs, and failure cases before seeing the answer.'}</p><button class="primary" id="start-teachback">${suggestion?(matched?'Practice the same concept':'Revisit the original example'):'Start teach-back'}</button>${suggestion&&!matched?'<p>No matching curated exercise is available for this concept and language. Revisit the original code or choose a topic below.</p>':''}</section><section class="curated-picker"><h2>Practice with known answers</h2><p>Authored JavaScript examples, graded locally. No AI usage. These are teaching examples, not your project code.</p><label>Concept <select id="curated-concept">${listExerciseConcepts().map(c=>`<option value="${c.id}" ${c.id===matched?.id?'selected':''}>${escape(c.title)}</option>`).join('')}</select></label><button class="secondary" id="start-curated">Practice this topic</button></section><div id="curated-exercise-host"></div><h2>My attempts · ${rows.length}</h2><p>Review intervals: needs practice 1 day, developing 2 days, supported 7 days. These are reminders, not proof of mastery.</p><div class="learning-attempts">${rows.map((r,i)=>`<details class="notebook-card"><summary><strong>${escape(r.concept)}</strong><span>${escape(r.selfAssessment||r.assessment)} · ${r.assessmentSource==='curated'?'Curated JavaScript example':r.revision===state.project.revision?'current source':'historical source'}</span></summary><div class="notebook-body"><div class="markdown">${markdown(r.question||'')}</div><p><strong>My explanation:</strong> ${escape(r.answer)}</p><div class="markdown"><strong>${r.assessmentSource==='curated'?'Curated check explanation:':'AI feedback:'}</strong>${markdown(r.feedback||'')}</div><ul>${(r.misconceptions||[]).map(x=>`<li>${escape(x)}</li>`).join('')}</ul><label>My assessment <select data-assessment="${i}"><option value="needs-practice" ${(r.selfAssessment||r.assessment)==='needs-practice'?'selected':''}>Needs practice</option><option value="developing" ${(r.selfAssessment||r.assessment)==='developing'?'selected':''}>Developing</option><option value="supported" ${(r.selfAssessment||r.assessment)==='supported'?'selected':''}>Supported in this example</option></select></label><button class="text-button" data-delete-attempt="${i}">Remove attempt</button></div></details>`).reverse().join('')||'<p>No attempts yet. Your first answer will appear here after feedback.</p>'}</div></div>`;
 bindEvidence($('#main'));
 $('#start-teachback').onclick=safe(async()=>{
  if(suggestion&&matched){startCurated(matched.id,suggestion.exercise||'');return;}
  const candidates=state.project.symbols.filter(s=>s.kind==='function'&&!state.project.files.find(f=>f.path===s.path)?.role?.match(/test|generated/));
  const chosen=suggestion?candidates.find(s=>s.id===suggestion.symbol&&s.path===suggestion.path):candidates.find(s=>s.id===state.symbol?.id)||candidates.find(s=>s.end-s.line<100)||candidates[0];
  if(!chosen)return notify(suggestion?'The original function is unavailable. Choose a concept below or open source to start another lesson.':'Choose a readable function to start.');
  cancelExplanation();state.mode='teachback';state.concept=suggestion?.concept||'';state.history=[];
  await openFile(chosen.path,{symbolId:chosen.id,line:chosen.line,preserveConversation:true,why:suggestion?'Revisited the original concept':'Started source teach-back'});await ask();
 });
 $('#start-curated').onclick=()=>startCurated($('#curated-concept').value);
 document.querySelectorAll('[data-assessment]').forEach(select=>select.onchange=()=>{const r=rows[Number(select.dataset.assessment)];r.selfAssessment=select.value;r.reviewAt=new Date(Date.now()+(select.value==='supported'?7:select.value==='developing'?2:1)*86400000).toISOString();persistLearning();});
 document.querySelectorAll('[data-delete-attempt]').forEach(b=>b.onclick=()=>{rows.splice(Number(b.dataset.deleteAttempt),1);persistLearning();renderLearning();});
}
function startCurated(concept,previousId=''){
 const prior=previousId||[...state.learning].reverse().find(r=>r.conceptId===concept&&r.exercise)?.exercise||'';
 const exercise=chooseExercise(concept,prior);
 if(!exercise)return notify('No reviewed exercise matches this concept. Choose a listed topic.');
 cancelExplanation();const host=$('#curated-exercise-host');if(!host)return;
 host.innerHTML=`<section id="curated-exercise" class="curated-exercise" data-exercise="${exercise.id}"><small>Curated JavaScript example · ${escape(exercise.concept)}</small><h2>Predict before you reveal</h2><pre><code>${syntaxLines(exercise.code,exercise.language).join('\n')}</code></pre><form id="curated-form"><fieldset><legend>${escape(exercise.question)}</legend>${exercise.options.map(o=>`<label><input type="radio" name="curated-answer" value="${o.id}" required>${escape(o.label)}</label>`).join('')}</fieldset><button class="primary">Check my prediction</button></form><div id="curated-result"></div></section>`;
 let submitted=false;
 $('#curated-form').onsubmit=e=>{
  e.preventDefault();if(submitted)return;
  const answer=host.querySelector('input[name="curated-answer"]:checked');if(!answer)return;
  const result=gradeExercise(exercise.id,answer.value);if(!result)return;
  submitted=true;
  state.learning=recordAttempt(state.learning,{...result,question:exercise.question,feedback:result.explanation,revision:'curated-v1',path:'',symbol:'',misconceptions:result.correct?[]:[exercise.concept]});persistLearning();
  host.querySelectorAll('input,form button').forEach(el=>el.disabled=true);
  $('#curated-result').innerHTML=`<div id="curated-feedback" role="status"><h3>${result.correct?'Correct prediction':'Revisit this prediction'}</h3><p>${escape(result.explanation)}</p><p>Curated answer check · one example, not proof of mastery. No project code was executed.</p><button class="secondary" id="next-curated">Try another example of this concept</button></div>`;
  const completed=$('#curated-exercise');
  renderLearning();$('#curated-exercise-host').append(completed);
  $('#next-curated').onclick=()=>startCurated(exercise.conceptId,exercise.id);
 };
 host.scrollIntoView({block:'nearest'});
}
async function renderAnswers(){
 $('#main').innerHTML='<div class="overview-scroll"><h1>Saved explanations.</h1><p>Answers are saved on this computer. Unchanged requests reuse them without new Codex usage. Historical answers need rechecking.</p><div id="answer-library">Loading saved answers…</div></div>';
 const target=$('#answer-library');try{
  const data=await api('/api/answers');if(target!==$('#answer-library'))return;
  target.innerHTML=`<button class="secondary" id="clear-answers">Clear this project’s saved explanations</button><div class="answer-list">${data.answers.map((a,i)=>`<details class="notebook-card"><summary><strong>${escape(a.file||'Project overview')}</strong><span>${escape(a.mode)} · ${a.freshness==='current'?'supporting source unchanged':a.freshness==='unknown'?'freshness unknown — recheck source':a.freshness==='historical'?'historical — supporting context changed':a.revision===state.project.revision?'current revision':'historical — recheck source'}</span><small>${escape(a.createdAt)}</small></summary><div class="notebook-body"><div class="markdown">${markdown(a.text)}</div>${a.file?`<button class="secondary" data-open-answer="${i}">Open saved explanation</button>`:''}</div></details>`).join('')||'<p>No saved explanations yet. Your next Codex answer will be saved automatically.</p>'}</div>`;
  $('#clear-answers').onclick=safe(async()=>{await api('/api/answers',{method:'DELETE'});renderAnswers();});
  target.querySelectorAll('[data-open-answer]').forEach(b=>b.onclick=safe(async()=>{const a=data.answers[Number(b.dataset.openAnswer)];if(!state.project.files.some(f=>f.path===a.file))return notify('That source file is not in the current project. You can still read the saved answer here.');state.mode=['explain','flow','review','practice','teachback','verify','recommend'].includes(a.mode)?a.mode:'explain';state.comparison=a.comparison||null;const opening=openFile(a.file,{symbolId:a.selection||'',line:a.range?.start||null,preserveConversation:true,why:'Opened saved explanation'}),sequence=fileSequence;await opening;if(sequence!==fileSequence)return;const range=a.range;state.range=range&&Number.isInteger(range.start)&&Number.isInteger(range.end)&&range.start>=1&&range.end>=range.start&&range.end<=state.file.content.split('\n').length&&range.end-range.start<=300?range:null;state.depth=['brief','normal','syntax'].includes(a.depth)?a.depth:'normal';state.history=[{role:'assistant',...a,cached:true,historical:a.freshness?a.freshness!=='current':a.revision!==state.project.revision}];renderMain();}));bindEvidence(target);
 }catch(error){if(target===$('#answer-library'))target.textContent=error.message;}
}

function renderRecommendationControls(){
 const el=$('#recommendation-controls');if(!el)return;if(state.mode!=='recommend'){el.innerHTML='';return;}
 el.innerHTML=`<div class="recommendation-controls"><p><strong>Review scope:</strong> selected code, bounded related source, and discovered test excerpts. Add a comparison for repeated logic. This is not a whole-project scan.</p><div class="comparison-row"><label>Compare with another file (optional)<input id="comparison-file" list="comparison-files" aria-label="Comparison file" placeholder="Type a project file path…" value="${escape(state.comparison?.path||'')}"><datalist id="comparison-files"></datalist></label><label>Around line<input type="number" id="comparison-line" aria-label="Comparison line" min="1" value="${state.comparison?.line||1}"></label><button id="clear-comparison" class="text-button">Clear comparison</button></div><small>Uses your Codex login. Suggestions are saved automatically; source stays read only.</small></div>`;
 const choices=()=>{const q=$('#comparison-file').value.toLowerCase();$('#comparison-files').innerHTML=state.project.files.filter(f=>f.path!==state.file?.path&&f.path.toLowerCase().includes(q)).slice(0,50).map(f=>`<option value="${escape(f.path)}"></option>`).join('');};choices();
 const change=()=>{cancelExplanation();const path=$('#comparison-file').value.trim(),line=Number($('#comparison-line').value),file=state.project.files.find(f=>f.path===path);state.history=[];state.comparison=path?{path,line}:null;renderConversation();if(path&&(!file||!Number.isInteger(line)||line<1||line>file.lines))notify('Choose a project file and a valid comparison line before generating.');};
 $('#comparison-file').oninput=choices;$('#comparison-file').onchange=change;$('#comparison-line').onchange=change;
 $('#clear-comparison').onclick=()=>{cancelExplanation();state.comparison=null;state.history=[];renderRecommendationControls();renderConversation();};
}
