import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

const bundle = (await build({entryPoints:['src/app.js'],bundle:true,write:false,format:'iife'})).outputFiles[0].text;
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
const content = 'const greeting = "Hello";\nfunction first() {\n  return greeting;\n}\nfunction second() {\n  return first();\n}';
const project = {id:'test',revision:'r1',name:'Test',root:'/test',frameworks:[],entries:[],packages:[],calls:[{from:'second',to:'first',line:6,kind:'calls',reference:{line:6,start:9,end:14}}],imports:[],files:[{path:'main.js',language:'javascript',lines:7,hash:'h1'}],symbols:[{id:'first',name:'first',kind:'function',path:'main.js',line:2,end:4},{id:'second',name:'second',kind:'function',path:'main.js',line:5,end:7}]};
async function setup(t,auto,{crossFile=false,testDelay=0,featureDelays={},savedAnswers=null,freshness=null,learningRecords=null}={}){
  const dom=new JSDOM('<div id="app"></div><div id="toast"></div><dialog id="folder-dialog"></dialog>',{url:'http://localhost:4317',runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  const w=dom.window,requests=[];
  w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.TextDecoder=TextDecoder;w.AbortController=AbortController;
  if(auto!==undefined)w.localStorage.setItem('atlas-auto',String(auto));
  if(learningRecords)w.localStorage.setItem('atlas-learning-test',JSON.stringify(learningRecords));
  w.localStorage.setItem('atlas-notebook-test',JSON.stringify([{path:'main.js',line:2,date:'2026-09-30',revision:'r1',answer:'Saved explanation'}]));
  const fixtureProject=crossFile?{...project,files:[...project.files,{path:'helper.js',language:'javascript',lines:4}],symbols:project.symbols.map(s=>s.id==='first'?{...s,path:'helper.js'}:s)}:project;
  w.fetch=async(url,options={})=>{
    if(url==='/api/explain'){
      const input=JSON.parse(options.body);requests.push({body:input,signal:options.signal});
      return new Response(JSON.stringify({type:'answer',text:'Explained selection',revision:'r1',evidence:[{path:'main.js',hash:'h1',start:1,end:7}],coaching:{recommendations:input.mode==='recommend'?[{title:'Share normalization',category:'duplication',priority:'medium',confidence:'medium',reason:'Two callers repeat the rule.',change:'Extract a helper.',benefit:'One validation rule.',tradeoff:'Adds coupling.',evidence:[{path:'main.js',line:2},{path:'helper.js',line:2}],verification:['Test both callers.']}]:[],claims:[{claim:'Trims input',evidence:[{path:'main.js',line:2}],assumptions:['Input is a string'],unknowns:['Caller validation not shown']}],findings:[{title:'Unchecked input',severity:'medium',confidence:'low',trigger:'Missing input',consequence:'Throws',evidence:[{path:'main.js',line:2}],verification:['Try empty input'],missingTests:['Undefined input']}],lesson:input.mode==='teachback'?{concept:'Runtime validation',question:input.question?'Try a different input':'What happens to an empty string? [Source](atlas://file?path=main.js&line=2)',feedback:input.question?'Types do not validate runtime input':'',misconceptions:input.question?['Types are not runtime checks']:[],nextExercise:'Inspect another function',assessment:input.question?'needs-practice':'not-assessed'}:null}})+'\n');
    }
    if(url.startsWith('/api/test-evidence?')){await pause(testDelay);return Response.json({tests:[{path:'main.js',line:6,relationship:'direct-call',reason:'Fixture call'}],scripts:[],affected:[],unknowns:['No tests were run']});}
    if(url.startsWith('/api/feature?')){const query=new URL(url,'http://localhost').searchParams.get('q');await pause(featureDelays[query]||0);return Response.json({query,candidates:[{path:'main.js',line:5,symbol:'second',name:query,reason:'Name candidate'}],stops:[{path:'main.js',line:5,symbol:'second',name:query,via:'start',reason:'Name candidate'}],boundaries:[],unknowns:['No runtime execution'],limited:false});}
    if(url==='/api/freshness')return Response.json(freshness||{stale:false,changedFiles:[]});
    if(url==='/api/answers')return Response.json({answers:savedAnswers||[{file:'main.js',selection:'first',revision:'old-revision',mode:'explain',createdAt:'2026-09-30',text:'Historical answer'}]});
    const file=url.startsWith('/api/file?')?new URL(url,'http://localhost').searchParams.get('path'):null;
    const data=url==='/api/session'?{token:'token'}:url==='/api/status'?{connected:true}:url==='/api/project'?fixtureProject:file?{path:file,language:'javascript',content:file==='helper.js'?'const greeting="Hello";\nexport function first(){\n return greeting;\n}':crossFile?'import {first} from "./helper.js";\n// imported helper\n// comment\n\nfunction second() {\n  return first();\n}':content}:{};
    return Response.json(data);
  };
  w.eval(bundle);
  await pause(20);
  w.document.querySelector('[data-view="notebook"]').click();
  w.document.querySelector('[data-note-source]').click();
  await pause(20);
  return {w,requests,click:n=>w.document.querySelector(`[data-line="${n}"]`).click()};
}

test('code click starts an explanation by default and rapid selections use the last function',async t=>{
  const {w,requests,click}=await setup(t);
  assert.equal(w.document.querySelector('#auto-explain').checked,true);
  click(3);click(6);
  assert.match(w.document.querySelector('#conversation').textContent,/Preparing|Connecting/);
  await pause(850);
  assert.equal(requests.length,1);
  assert.equal(requests[0].body.selection,'second');
  assert.match(w.document.querySelector('#conversation').textContent,/Explained selection/);
});

test('shift-click explains the selected range',async t=>{
  const {w,requests,click}=await setup(t,true);
  click(3);
  w.document.querySelector('[data-line="6"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true,shiftKey:true}));
  await pause(850);
  assert.equal(requests.length,1);
  assert.deepEqual(requests[0].body.range,{start:3,end:6});
  assert.equal(requests[0].body.selection,'');
});

test('turning automatic explanations off cancels a pending selection',async t=>{
  const {w,requests,click}=await setup(t,true);
  click(3);
  w.document.querySelector('#auto-explain').click();
  await pause(850);
  assert.equal(requests.length,0);
  assert.equal(w.localStorage.getItem('atlas-auto'),'false');
  click(6);
  await pause(850);
  assert.equal(requests.length,0);
});

test('stopping a pending explanation restores the manual explanation button',async t=>{
 const {w,requests,click}=await setup(t,true);click(3);
 w.document.querySelector('#stop').click();
 assert.ok(w.document.querySelector('#explain-now'),'stopped selection can be explained manually');
 await pause(850);assert.equal(requests.length,0);
});

test('opening a saved explanation does not replace it or use Codex allowance',async t=>{
  const {w,requests}=await setup(t,true);
  await pause(850);
  assert.equal(requests.length,0);
  assert.match(w.document.querySelector('#conversation').textContent,/Saved explanation/);
});

test('clicking a function reference opens its definition, shows callers and supports Back',async t=>{
 const {w,requests,click}=await setup(t,true);
 click(6);
 const reference=w.document.querySelector('[data-line="6"] .source-link');
 assert.ok(reference,'resolved function call is a clickable source link');
 assert.equal(reference.textContent,'first');
 assert.equal(w.document.querySelector('[data-line="6"] code').textContent,'  return first();');
 reference.click();await pause(20);
 assert.match(w.document.querySelector('#selection-context').textContent,/first · lines 2–4/);
 assert.match(w.document.querySelector('#connections').textContent,/Called by.*second/s);
 assert.match(w.document.querySelector('#connections').textContent,/main.js:6/);
 await pause(850);
 assert.equal(requests.length,1);assert.equal(requests[0].body.selection,'first');
 w.document.querySelector('#back').click();await pause(20);
 assert.match(w.document.querySelector('#selection-context').textContent,/second · lines 5–7/);
});

test('function links navigate across files and callers return to the original call site',async t=>{
 const {w}=await setup(t,false,{crossFile:true});
 const reference=w.document.querySelector('.source-link');assert.ok(reference);
 reference.click();await pause(20);
 assert.equal(w.document.querySelector('#current-file').textContent,'helper.js');
 assert.match(w.document.querySelector('#selection-context').textContent,/first · lines 2–4/);
 w.document.querySelector('[data-related="main.js"]').click();await pause(20);
 assert.equal(w.document.querySelector('#current-file').textContent,'main.js');
 assert.match(w.document.querySelector('#selection-context').textContent,/second · lines 5–7/);
});

test('Alt-click previews a definition without losing the current file or asking Codex',async t=>{
 const {w,requests,click}=await setup(t,false,{crossFile:true});click(6);
 w.document.querySelector('.source-link').dispatchEvent(new w.MouseEvent('click',{bubbles:true,altKey:true}));
 await pause(20);
 assert.ok(w.document.querySelector('#peek-dialog')?.open,'definition preview opens');
 assert.match(w.document.querySelector('#peek-dialog').textContent,/helper.js/);
 assert.equal(w.document.querySelector('#current-file').textContent,'main.js');
 assert.equal(requests.length,0);
 w.document.querySelector('#peek-open').click();await pause(20);
 assert.equal(w.document.querySelector('#current-file').textContent,'helper.js');
 assert.match(w.document.querySelector('#reading-trail').textContent,/main.js/);
});


test('structured claims expose assumptions and verification clears on selection change',async t=>{
 const {w,click}=await setup(t,false);click(3);w.document.querySelector('#explain-now').click();await pause(20);
 assert.match(w.document.querySelector('.evidence-panel').textContent,/Input is a string/);
 w.document.querySelector('[data-verify-finding]').click();await pause(40);
 assert.match(w.document.querySelector('#verification-panel').textContent,/No tests have been run/);
 click(6);assert.equal(w.document.querySelector('.verification-panel'),null);
});

test('changing selection during verification discovery prevents a late AI request',async t=>{
 const {w,requests,click}=await setup(t,false,{testDelay:80});click(3);
 w.document.querySelector('#explain-now').click();await pause(20);
 w.document.querySelector('[data-verify-finding]').click();click(6);await pause(120);
 assert.equal(requests.length,1);
});

test('the latest feature search wins when older results arrive later',async t=>{
 const {w}=await setup(t,false,{featureDelays:{old:80,new:5}});
 w.document.querySelector('[data-view="features"]').click();
 const form=w.document.querySelector('#feature-form'),query=w.document.querySelector('#feature-query');
 query.value='old';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 query.value='new';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await pause(120);
 assert.match(w.document.querySelector('#feature-results').textContent,/new/);
 assert.doesNotMatch(w.document.querySelector('#feature-results').textContent,/old/);
});

test('teach-back saves feedback after an answer and exposes it in the learning plan',async t=>{
 const {w}=await setup(t,false);w.document.querySelector('[data-view="learning"]').click();
 w.document.querySelector('#start-teachback').click();await pause(30);
 assert.match(w.document.querySelector('.lesson-card').textContent,/What happens to an empty string/);
 assert.equal(w.localStorage.getItem('atlas-learning-test'),null);
 w.document.querySelector('#question').value='Types validate runtime inputs';
 w.document.querySelector('#ask-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await pause(30);
 const records=JSON.parse(w.localStorage.getItem('atlas-learning-test'));assert.equal(records.length,1);assert.match(records[0].question,/What happens to an empty string/);
 w.document.querySelector('[data-view="learning"]').click();assert.match(w.document.querySelector('.learning-attempts').textContent,/Types do not validate runtime input/);
});

test('saved historical answers open without consuming another AI request',async t=>{
 const {w,requests}=await setup(t,true);w.document.querySelector('[data-view="answers"]').click();await pause(20);
 assert.match(w.document.querySelector('#answer-library').textContent,/historical/);
 w.document.querySelector('[data-open-answer]').click();await pause(850);
 assert.equal(requests.length,0);assert.match(w.document.querySelector('#conversation').textContent,/Saved from an earlier source revision/);
});

test('opening an unrelated file does not send the previous feature walkthrough to Codex',async t=>{
 const {w,requests}=await setup(t,false,{crossFile:true});
 w.document.querySelector('[data-view="features"]').click();w.document.querySelector('#feature-query').value='second';
 w.document.querySelector('#feature-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await pause(20);
 w.document.querySelector('[data-feature-candidate]').click();await pause(20);w.document.querySelector('#explain-now').click();await pause(20);
 assert.equal(requests[0].body.feature.query,'second');
 w.document.querySelector('[data-file="helper.js"]').click();await pause(20);w.document.querySelector('#explain-now').click();await pause(20);
 assert.equal(requests[1].body.feature,null);
});

test('changing to teach-back collapses supporting panels to keep the source readable',async t=>{
 const {w,click}=await setup(t,false);click(3);w.document.querySelector('#test-evidence').click();await pause(20);
 assert.equal(w.document.querySelector('.verification-panel').open,true);
 w.document.querySelector('[data-mode="teachback"]').click();
 assert.equal(w.document.querySelector('.verification-panel').open,false);
});

test('lesson source references render as safe clickable evidence instead of raw Markdown',async t=>{
 const {w}=await setup(t,false);w.document.querySelector('[data-view="learning"]').click();
 w.document.querySelector('#start-teachback').click();await pause(30);
 assert.ok(w.document.querySelector('.lesson-card a[href^="atlas:"]'),'lesson includes a clickable source link');
});


test('AI recommendations use selected source and comparison, with previews and a change plan',async t=>{
 const {w,requests}=await setup(t,false,{crossFile:true});
 const nav=w.document.querySelector('[data-view="recommendations"]');assert.ok(nav,'AI recommendations section is available');nav.click();
 assert.match(w.document.querySelector('#conversation').textContent,/Generate recommendations/);
 const comparison=w.document.querySelector('#comparison-file');comparison.value='helper.js';comparison.dispatchEvent(new w.Event('change'));
 w.document.querySelector('#explain-now').click();await pause(30);
 assert.equal(requests[0].body.mode,'recommend');assert.equal(requests[0].body.file,'main.js');
 assert.deepEqual(requests[0].body.comparison,{path:'helper.js',line:1});
 const card=w.document.querySelector('.recommendation-card');assert.ok(card);assert.match(card.textContent,/Adds coupling/);
 card.querySelector('[data-evidence-path="helper.js"]').click();await pause(20);
 assert.ok(w.document.querySelector('#peek-dialog').open);assert.match(w.document.querySelector('#current-file').textContent,/main.js/);
 w.document.querySelector('#peek-close').click();
 card.querySelector('[data-plan-recommendation]').click();await pause(30);
 assert.equal(requests[1].body.mode,'recommend');assert.match(requests[1].body.question,/Share normalization/);
 assert.match(requests[1].body.question,/behavior/);
});

test('Explain selected line leaves teaching mode and asks for a syntax explanation',async t=>{
 const {w,requests,click}=await setup(t,false);click(3);
 w.document.querySelector('[data-mode="teachback"]').click();
 w.document.querySelector('#explain-line').click();await pause(30);
 assert.equal(requests[0].body.mode,'explain');
 assert.equal(requests[0].body.depth,'syntax');assert.deepEqual(requests[0].body.range,{start:3,end:3});
 assert.equal(w.document.querySelector('[data-mode="explain"]').getAttribute('aria-selected'),'true');
});


test('saved range explanations restore their range and depth for follow-up questions',async t=>{
 const {w,requests}=await setup(t,false,{savedAnswers:[{file:'main.js',selection:'',range:{start:2,end:4},depth:'syntax',revision:'r1',mode:'explain',text:'Selected lines'}]});
 w.document.querySelector('[data-view="answers"]').click();await pause(20);
 w.document.querySelector('[data-open-answer]').click();await pause(30);
 assert.match(w.document.querySelector('#selection-context').textContent,/Lines 2–4/);
 assert.equal(w.document.querySelector('#depth').value,'syntax');
 w.document.querySelector('#question').value='Explain that range again';w.document.querySelector('#ask-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await pause(30);
 assert.deepEqual(requests[0].body.range,{start:2,end:4});
 assert.equal(requests[0].body.depth,'syntax');
});

test('project overview explanation drops the previously selected function and range',async t=>{
 const {w,requests,click}=await setup(t,false);click(3);
 w.document.querySelector('[data-line="4"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true,shiftKey:true}));
 w.document.querySelector('[data-view="overview"]').click();w.document.querySelector('#overview-explain').click();await pause(30);
 assert.equal(requests[0].body.mode,'overview');assert.equal(requests[0].body.file,'');
 assert.equal(requests[0].body.selection,'');assert.equal(requests[0].body.range,null);
 assert.match(w.document.querySelector('#selection-context').textContent,/Project overview/);
});


test('evidence levels require a user check and independent results, not just source links',async t=>{
 const {w,requests,click}=await setup(t,false);click(3);w.document.querySelector('#explain-now').click();await pause(25);
 const card=()=>w.document.querySelector('.evidence-card');
 assert.match(card().textContent,/AI suggestion/);
 const record=card().querySelector('[data-record-evidence]');assert.ok(record,'a claim can receive a recorded human check');record.click();
 const dialog=w.document.querySelector('#evidence-dialog');assert.ok(dialog.open);
 const form=dialog.querySelector('form');
 dialog.querySelector('#evidence-method').value='source';
 dialog.querySelector('#evidence-steps').value='Read main.js:2 and its return expression.';
 dialog.querySelector('#evidence-expected').value='The function trims a string.';
 dialog.querySelector('#evidence-observed').value='The return expression uses trim.';
 dialog.querySelector('#evidence-confirmed').checked=true;
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await pause(25);
 assert.match(card().textContent,/Source-supported/);assert.match(card().textContent,/user checked/);
 card().querySelector('[data-record-evidence]').click();
 dialog.querySelector('#evidence-method').value='independent';
 dialog.querySelector('#evidence-steps').value='Ran a focused isolated trim test.';
 dialog.querySelector('#evidence-expected').value='abc';dialog.querySelector('#evidence-observed').value='abc';
 dialog.querySelector('#evidence-artifact').value='trim.test.js output: 1 passed';
 dialog.querySelector('#evidence-confirmed').checked=true;
 dialog.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await pause(25);
 assert.match(card().textContent,/Independently verified/);assert.match(card().textContent,/user reported/);
 assert.equal(requests.length,1,'recording evidence must not ask AI to certify itself');
 const records=JSON.parse(w.localStorage.getItem('atlas-evidence-test'));assert.equal(records.length,2);
});

test('different example uses the same curated concept, grades locally and hides the answer until submission',async t=>{
 const {w,requests}=await setup(t,false);w.document.querySelector('[data-view="learning"]').click();
 w.document.querySelector('#start-teachback').click();await pause(25);
 w.document.querySelector('#question').value='Types check the runtime value';
 w.document.querySelector('#ask-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await pause(25);
 w.document.querySelector('[data-view="learning"]').click();w.document.querySelector('#start-teachback').click();
 const quiz=w.document.querySelector('#curated-exercise');assert.ok(quiz,'a matched authored exercise replaces arbitrary source selection');
 assert.match(quiz.textContent,/Runtime validation/);assert.match(quiz.textContent,/JavaScript/);
 assert.equal(w.document.querySelector('#curated-feedback'),null);
 w.document.querySelector('input[name="curated-answer"][value="b"]').checked=true;
 w.document.querySelector('#curated-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 assert.match(w.document.querySelector('#curated-feedback').textContent,/Correct/);
 assert.match(w.document.querySelector('#curated-feedback').textContent,/not.*mastery/i);
 const records=JSON.parse(w.localStorage.getItem('atlas-learning-test'));
 assert.equal(records.length,2);assert.equal(records[1].assessmentSource,'curated');assert.equal(records[1].correct,true);
 assert.equal(w.document.querySelectorAll('.learning-attempts .notebook-card').length,2,'the new attempt is visible immediately');
 assert.equal(requests.length,2,'curated grading uses no AI request');
 const previous=w.document.querySelector('#curated-exercise').dataset.exercise;
 w.document.querySelector('#next-curated').click();
 assert.notEqual(w.document.querySelector('#curated-exercise').dataset.exercise,previous);
 assert.match(w.document.querySelector('#curated-exercise').textContent,/Runtime validation/);
 w.document.querySelector('[data-delete-attempt="0"]').click();
 const remaining=JSON.parse(w.localStorage.getItem('atlas-learning-test'));assert.equal(remaining.length,1);assert.equal(remaining[0].assessmentSource,'curated');
});


test('unrelated disk changes do not block explanation but selected-file changes still do',async t=>{
 for(const changed of ['README.md','main.js']){
  const {w,requests,click}=await setup(t,false,{freshness:{stale:true,changedFiles:[changed]}});
  w.dispatchEvent(new w.Event('focus'));await pause(25);click(3);w.document.querySelector('#explain-now').click();await pause(25);
  assert.equal(requests.length,changed==='main.js'?0:1);
 }
});
test('saved answer uses dependency freshness instead of unrelated project revision',async t=>{
 const {w,requests}=await setup(t,false,{savedAnswers:[{file:'main.js',revision:'earlier',freshness:'current',mode:'explain',text:'Still relevant',dependencies:{files:[{path:'main.js',hash:'h1'}]}}]});
 w.document.querySelector('[data-view="answers"]').click();await pause(25);
 assert.match(w.document.querySelector('#answer-library').textContent,/supporting source unchanged/i);
 w.document.querySelector('[data-open-answer]').click();await pause(25);
 assert.doesNotMatch(w.document.querySelector('#conversation').textContent,/Saved from an earlier source revision/);
 assert.equal(requests.length,0);
});
test('unmatched learning concepts do not silently select an unrelated function',async t=>{
 const records=[{concept:'Distributed consensus',path:'missing.go',symbol:'missing',answer:'My answer',assessment:'needs-practice',date:'2026-09-30',reviewAt:'2026-10-01',revision:'r1'}];
 const {w,requests}=await setup(t,false,{learningRecords:records});w.document.querySelector('[data-view="learning"]').click();
 assert.match(w.document.querySelector('#main').textContent,/No matching curated exercise/);
 w.document.querySelector('#start-teachback').click();await pause(25);
 assert.equal(requests.length,0);assert.equal(w.document.querySelector('#curated-exercise'),null);
 assert.match(w.document.querySelector('#toast').textContent,/original function is unavailable/i);
});


test('a changed source cannot receive a stronger evidence label from an already open answer',async t=>{
 const {w,click}=await setup(t,false,{freshness:{stale:true,changedFiles:['main.js']}});click(3);w.document.querySelector('#explain-now').click();await pause(25);
 w.document.querySelector('.evidence-card [data-record-evidence]').click();
 const d=w.document.querySelector('#evidence-dialog');
 d.querySelector('#evidence-steps').value='Read source';d.querySelector('#evidence-expected').value='A';d.querySelector('#evidence-observed').value='A';d.querySelector('#evidence-confirmed').checked=true;
 d.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await pause(25);
 assert.match(d.querySelector('#evidence-error').textContent,/fresh|current/i);
 assert.equal(w.localStorage.getItem('atlas-evidence-test'),null);
 assert.match(w.document.querySelector('.evidence-card').textContent,/AI suggestion/);
});

test('an open answer loses its verification when Git context changes without a working-file change',async t=>{
 const saved={file:'main.js',revision:'r1',freshness:'current',createdAt:'2026-10-01',mode:'review',text:'A diff claim',dependencies:{files:[{path:'main.js',hash:'h1'}],fingerprint:'diff-context'},evidence:[{path:'main.js',hash:'h1',start:1,end:7}],coaching:{claims:[{claim:'The change trims input',evidence:[{path:'main.js',line:2}]}],findings:[]}};
 const {w}=await setup(t,false,{savedAnswers:[saved],freshness:{stale:false,changedFiles:[]}});
 w.document.querySelector('[data-view="answers"]').click();await pause(25);w.document.querySelector('[data-open-answer]').click();await pause(25);
 w.document.querySelector('.evidence-card [data-record-evidence]').click();const d=w.document.querySelector('#evidence-dialog');
 d.querySelector('#evidence-steps').value='Read the staged diff';d.querySelector('#evidence-expected').value='Trims';d.querySelector('#evidence-observed').value='Trims';d.querySelector('#evidence-confirmed').checked=true;
 d.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await pause(25);
 assert.match(w.document.querySelector('.evidence-card').textContent,/Source-supported/);
 saved.freshness='historical';w.dispatchEvent(new w.Event('focus'));await pause(25);
 assert.match(w.document.querySelector('.trust-badge').textContent,/AI suggestion/);
 assert.match(w.document.querySelector('#conversation').textContent,/Saved from an earlier source revision/);
});
