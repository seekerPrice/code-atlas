import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from '../server/codex.mjs';
import { parseCoaching } from '../server/coaching.mjs';
const evidence=[{path:'src/save.ts',start:10,end:20}];
const claim={claim:'Save writes the item.',evidence:[{path:'src/save.ts',line:12}],assumptions:[],unknowns:[]};
const finding={title:'Empty input reaches save',severity:'medium',confidence:'high',trigger:'Submit an empty value',consequence:'An empty record may be stored',evidence:[{path:'src/save.ts',line:14}],verification:['Try an empty input in an isolated environment'],missingTests:['Empty input test']};
const response=(extra={})=>JSON.stringify({summary:'See [save:12](atlas://file?path=src%2Fsave.ts&line=12).',claims:[claim],findings:[finding],lesson:null,...extra});

test('structured coaching preserves checked locations without treating them as proven claims',()=>{
  const result=parseCoaching(response(),evidence);
  assert.equal(result.coaching.claims[0].evidenceStatus,'location-checked');
  assert.deepEqual(result.coaching.findings[0].evidence,[{path:'src/save.ts',line:14}]);
  assert.equal(result.coaching.claims[0].invalidEvidence,0);
  assert.deepEqual(result.citations,{valid:3,invalid:0});
});
test('invented paths, out-of-excerpt lines and noninteger references are discarded',()=>{
  const refs=[{path:'secret.ts',line:12},{path:'src/save.ts',line:21},{path:'src/save.ts',line:11.5},{path:'src/save.ts',line:'12'}];
  const result=parseCoaching(response({claims:[{...claim,evidence:refs}],findings:[{...finding,evidence:refs}]}),evidence);
  assert.deepEqual(result.coaching.claims[0].evidence,[]);
  assert.equal(result.coaching.claims[0].evidenceStatus,'missing');
  assert.equal(result.coaching.claims[0].invalidEvidence,4);
  assert.ok(result.coaching.claims[0].unknowns.some(x=>/evidence/i.test(x)));
  assert.equal(result.coaching.findings[0].confidence,'low');
  assert.deepEqual(result.citations,{valid:1,invalid:8});
});
test('fenced JSON parses and invalid summary source links lose their clickable target',()=>{
  const result=parseCoaching('```json\n'+response({summary:'[wrong](atlas://file?path=src%2Fsave.ts&line=99)'})+'\n```',evidence);
  assert.ok(result.coaching);
  assert.equal(result.text,'wrong (unverified source reference)');
  assert.equal(result.citations.invalid,1);
});
test('malformed JSON and invalid root shapes fall back to citation-checked text',()=>{
  for(const raw of ['{broken JSON [bad](atlas://file?path=private.ts&line=1)','{"summary":42,"claims":[],"findings":[]}','Plain Markdown [bad](atlas://file?path=private.ts&line=1)']) {
    const result=parseCoaching(raw,evidence);
    assert.equal(result.coaching,null);
    assert.ok(!result.text.includes('atlas://file?path=private'));
  }
});
test('invalid entries are dropped, lists and text are bounded, and unknown assessments never imply mastery',()=>{
  const lesson={concept:'State boundaries',question:'What happens?',feedback:'Explain the branch',misconceptions:['Skipped the guard',42],nextExercise:'Find a different guard',assessment:'mastered'};
  const result=parseCoaching(response({claims:[null,{claim:42},...Array.from({length:100},()=>({...claim,claim:'x'.repeat(8000)}))],findings:[{...finding,severity:'critical'}],lesson}),evidence);
  assert.ok(result.coaching.claims.length>0 && result.coaching.claims.length<=20);
  assert.ok(result.coaching.claims[0].claim.length<=4000);
  assert.equal(result.coaching.findings.length,0);
  assert.equal(result.coaching.lesson.assessment,'not-assessed');
  assert.deepEqual(result.coaching.lesson.misconceptions,['Skipped the guard']);
});
test('missing evidence remains explicit even when the model omits its uncertainty',()=>{
  const result=parseCoaching(response({claims:[{...claim,evidence:[]}],findings:[]}),evidence);
  assert.equal(result.coaching.claims[0].evidenceStatus,'missing');
  assert.ok(result.coaching.claims[0].unknowns.length>0);
});
test('structured prompts include bounded learner data with an explicit untrusted boundary',()=>{
  const prompt=buildPrompt({context:'source',mode:'teachback',structured:true,learning:{concept:'State',attempts:Array.from({length:100},(_,i)=>({answer:`attempt-${i} `+'x'.repeat(10000)})),secret:'must-not-include'},feature:{unknowns:['Network boundary']}});
  assert.ok(prompt.includes('"summary"'));
  assert.ok(prompt.includes('"assessment"'));
  assert.ok(prompt.includes('attempt-99'));
  assert.ok(!prompt.includes('attempt-0 '));
  assert.ok(!prompt.includes('must-not-include'));
  assert.ok(prompt.length<24000);
  assert.match(prompt,/learning.*untrusted/i);
});
test('verification prompts include the supplied finding and discovered tests within untrusted data',()=>{
  const prompt=buildPrompt({context:'source',mode:'verify',structured:true,verification:{finding,tests:[{path:'tests/save.test.ts',reason:'Direct import'}],commands:['npm test']}});
  assert.ok(prompt.includes('Empty input reaches save'));
  assert.ok(prompt.includes('tests/save.test.ts'));
  assert.match(prompt,/verification.*untrusted/i);
});
test('learner attempts expose only supported fields and preserve the current answer after oversized history',()=>{
  const prompt=buildPrompt({context:'source',mode:'teachback',structured:true,learning:{concept:'State',answer:'CURRENT ANSWER',attempts:[{answer:'older answer',instructions:'HIDDEN DIRECTIVE',question:'q'.repeat(50000),feedback:'f'.repeat(50000)}]}});
  assert.ok(prompt.includes('CURRENT ANSWER'));
  assert.ok(!prompt.includes('HIDDEN DIRECTIVE'));
  assert.ok(prompt.length<20000);
});

const recommendation={title:'Share repeated input normalization',category:'duplication',priority:'medium',confidence:'high',reason:'The same rule is repeated.',change:'Extract a shared helper.',benefit:'Keep the validation rule consistent.',tradeoff:'Couples the two callers.',evidence:[{path:'src/save.ts',line:12},{path:'src/save.ts',line:18}],verification:['Test both callers with empty input.']};
test('recommendations preserve actionable trade-offs and distinct checked evidence',()=>{
 const result=parseCoaching(response({recommendations:[recommendation]}),evidence);
 assert.equal(result.coaching.recommendations?.length,1);
 const item=result.coaching.recommendations[0];
 assert.equal(item.category,'duplication');assert.equal(item.tradeoff,recommendation.tradeoff);
 assert.equal(item.confidence,'high');assert.equal(item.evidence.length,2);
});
test('duplication with repeated or unsupported locations is labeled insufficient evidence',()=>{
 const result=parseCoaching(response({recommendations:[{...recommendation,evidence:[{path:'src/save.ts',line:12},{path:'src/save.ts',line:12},{path:'missing.ts',line:1}]}]}),evidence);
 assert.equal(result.coaching.recommendations?.length,1);
 const item=result.coaching.recommendations[0];assert.equal(item.confidence,'low');
 assert.equal(item.evidence.length,1);assert.equal(item.evidenceStatus,'insufficient');
 assert.match(item.caution,/two distinct/i);
});
test('recommendations drop malformed categories and cap suggestions',()=>{
 const result=parseCoaching(response({recommendations:[{...recommendation,category:'made-up'},null,...Array(20).fill(recommendation)]}),evidence);
 assert.equal(result.coaching.recommendations?.length,5);
});
test('recommendation prompt asks for justified improvements without manufacturing work',()=>{
 const prompt=buildPrompt({context:'source',mode:'recommend',structured:true});
 assert.match(prompt,/recommendations/);assert.match(prompt,/duplication/);assert.match(prompt,/tradeoff/);
 assert.match(prompt,/two distinct/);assert.match(prompt,/no worthwhile/i);
});
