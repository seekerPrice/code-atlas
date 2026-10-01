import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseExercise,gradeExercise,listExerciseConcepts,matchConcept} from '../src/exercises.js';

test('concept matching is conservative, deterministic, and never falls back to an unrelated topic',()=>{
 for(const concept of ['CSS layout','Dependency injection','Mutation testing','SQL mutations','Python shallow copies','C shallow copies','C++ reference equality','C# object equality','Go async errors','Kotlin closures','Swift closures','Lua closures','React state mutations','Async errors and closures','',null]){
  assert.equal(matchConcept(concept),null,JSON.stringify(concept));
  assert.equal(chooseExercise(concept),null,JSON.stringify(concept));
 }
 for(const [concept,id] of [['Mutation / shallow copies','shallow-copy'],['Runtime input validation and guards','runtime-validation'],['Promise rejection handling','async-errors'],['Reference equality','reference-equality'],['Nullish defaults','nullish-defaults'],['Array map and filter','array-transform'],['Closures and lexical scope','closures']]){
  assert.equal(matchConcept(concept)?.id,id);
  assert.equal(chooseExercise(concept)?.conceptId,id);
  assert.deepEqual(chooseExercise(concept),chooseExercise(concept));
 }
});

test('different examples stay on the selected concept with an explicit supported language',()=>{
 const concepts=listExerciseConcepts();assert.equal(concepts.length,7);
 for(const concept of concepts){
  const first=chooseExercise(concept.id),second=chooseExercise(concept.id,first.id);
  assert.notEqual(first.id,second.id);assert.notEqual(first.code,second.code);
  assert.equal(first.conceptId,concept.id);assert.equal(second.conceptId,concept.id);
  assert.equal(first.language,'javascript');assert.equal(second.language,'javascript');
  assert.equal(chooseExercise(concept.id,'unrelated-id').id,first.id);
 }
 assert.equal(chooseExercise('shallow-copy','','python'),null);
 assert.deepEqual(listExerciseConcepts('python'),[]);
});

test('the initial exercise has no grading data and callers cannot mutate the catalog',()=>{
 const exercise=chooseExercise('shallow-copy');
 assert.deepEqual(Object.keys(exercise).sort(),['code','concept','conceptId','id','language','options','question']);
 assert(exercise.options.every(option=>Object.keys(option).sort().join(',')==='id,label'));
 exercise.options[0].label='tampered';exercise.code='tampered';
 const fresh=chooseExercise('shallow-copy');
 assert.notEqual(fresh.options[0].label,'tampered');assert.notEqual(fresh.code,'tampered');
});

test('grading accepts only listed answers and labels correct answers as one curated check, not mastery',()=>{
 const exercise=chooseExercise('shallow-copy');
 assert.equal(gradeExercise('unknown','a'),null);
 assert.equal(gradeExercise(exercise.id,'invalid'),null);
 const correct=gradeExercise(exercise.id,'b'),wrong=gradeExercise(exercise.id,'a');
 assert.equal(correct.correct,true);assert.equal(wrong.correct,false);
 assert.equal(correct.assessment,'developing');assert.equal(wrong.assessment,'needs-practice');
 for(const result of [correct,wrong]){
  assert.equal(result.assessmentSource,'curated');assert.equal(result.exercise,exercise.id);
  assert.equal(result.conceptId,exercise.conceptId);assert.equal(result.language,exercise.language);
  assert.deepEqual(result.correctAnswer,{id:'b',label:'2 and 2'});
  assert.match(result.explanation,/nested|shared/i);
 }
});

test('all curated answers agree with safe, handcrafted examples of the language rules',async()=>{
 // These literals repeat the authored examples. No source file, exercise string, or user code is executed.
 const original={profile:{score:1}},copy={...original};copy.profile.score=2;
 const values=[1,2],other=values.slice();other.push(3);
 const isCount=value=>typeof value==='number'&&Number.isFinite(value);
 const readName=value=>value!==null&&typeof value==='object'&&typeof value.name==='string'?value.name:'unknown';
 const caught=async()=>{try{return await Promise.reject(new Error('offline'));}catch{return 'fallback';}};
 const events=[];try{events.push('start');await Promise.reject(new Error('offline'));events.push('after');}catch{events.push('caught');}finally{events.push('done');}
 const one={id:1},two={id:1},same=one;
 const left=[1,2],right=[1,2];
 const zero=0,empty='';
 let count=0;const read=()=>count;count=3;
 const readers=[];for(let index=0;index<2;index++)readers.push(()=>index);
 const answers={
  'shallow-copy-nested-v1':`${original.profile.score} and ${copy.profile.score}`,
  'shallow-copy-array-v1':`${values.length} and ${other.length}`,
  'runtime-validation-number-v1':JSON.stringify([isCount('3'),isCount(3)]),
  'runtime-validation-guard-v1':JSON.stringify([readName(null),readName({name:'Ada'})]),
  'async-errors-fallback-v1':await caught(),
  'async-errors-finally-v1':events.join(', '),
  'reference-equality-object-v1':`${one===two}, ${one===same}`,
  'reference-equality-array-v1':`${left===right}, ${left[0]===right[0]}`,
  'nullish-defaults-zero-v1':`${zero||10}, ${zero??10}`,
  'nullish-defaults-empty-v1':JSON.stringify([empty??'guest',null??'guest']),
  'array-transform-map-v1':JSON.stringify([1,2,3].map(number=>number*2)),
  'array-transform-filter-v1':JSON.stringify([1,2,3,4].filter(number=>number%2===0)),
  'closures-binding-v1':String(read()),
  'closures-loop-v1':JSON.stringify(readers.map(reader=>reader())),
 };
 let checked=0;
 for(const concept of listExerciseConcepts()){
  let previous='';
  for(let variant=0;variant<2;variant++){
   const exercise=chooseExercise(concept.id,previous);previous=exercise.id;
   const expected=answers[exercise.id];assert.notEqual(expected,undefined,exercise.id);
   const results=exercise.options.map(option=>gradeExercise(exercise.id,option.id));
   assert.equal(results.filter(result=>result.correct).length,1,exercise.id);
   assert.equal(results.find(result=>result.correct).answer,expected,exercise.id);checked++;
  }
 }
 assert.equal(checked,Object.keys(answers).length);
});
