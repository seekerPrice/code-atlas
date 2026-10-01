import test from 'node:test';
import assert from 'node:assert/strict';
import * as learning from '../src/learning.js';
const storage=()=>{const items=new Map();return {getItem:k=>items.get(k)||null,setItem:(k,v)=>items.set(k,v),removeItem:k=>items.delete(k)}};
test('teach-back saves tentative misconceptions and schedules a weak concept before a supported one',()=>{
 const s=storage();let records=[];
 records=learning.recordAttempt(records,{concept:'Validation',answer:'Types validate input',assessment:'needs-practice',misconceptions:['Types do not check runtime input'],path:'validate.ts',revision:'r1'},'2026-09-30T00:00:00Z');
 records=learning.recordAttempt(records,{concept:'Imports',answer:'They share code',assessment:'supported',misconceptions:[],path:'main.ts',revision:'r1'},'2026-09-30T00:01:00Z');
 assert(learning.saveLearning(s,'p',records));
 const saved=learning.loadLearning(s,'p');assert.equal(saved.length,2);
 assert.equal(learning.suggestLesson(saved,'2026-10-01T00:00:00Z').concept,'Validation');
 assert.equal(learning.learningContext(saved,'Validation').misconceptions[0],'Types do not check runtime input');
 assert.equal(learning.loadLearning(s,'other').length,0);
});
test('learning tolerates corrupt storage and caps saved attempts without treating questions as answers',()=>{
 const s=storage();s.setItem('atlas-learning-p','{"bad":true}');assert.deepEqual(learning.loadLearning(s,'p'),[]);
 assert.equal(learning.recordAttempt([],{concept:'Types',answer:'',assessment:'not-assessed'}).length,0);
 let rows=[];for(let i=0;i<205;i++)rows=learning.recordAttempt(rows,{concept:'Types',answer:'attempt '+i,assessment:'developing'});
 assert.equal(rows.length,200);assert.equal(rows[0].answer,'attempt 5');
});
test('curated exercise metadata survives recording and storage alongside legacy AI attempts',()=>{
 const s=storage(),legacy={concept:'Mutation',answer:'It copies everything',assessment:'needs-practice',question:'Explain copying',feedback:'The nested reference is shared',date:'2026-09-30T00:00:00.000Z',reviewAt:'2026-10-01T00:00:00.000Z'};
 const records=learning.recordAttempt([legacy],{concept:'Mutation and shallow copies',conceptId:'shallow-copy',exercise:'shallow-copy-nested-v1',language:'javascript',answerId:'b',correct:true,assessmentSource:'curated',answer:'2 and 2',question:'Which scores?',feedback:'A shallow copy shares its nested reference.',assessment:'developing'},'2026-10-01T00:00:00Z');
 assert.equal(records.length,2);assert.deepEqual(records[0],legacy);
 const attempt=records[1];
 assert.equal(attempt.conceptId,'shallow-copy');assert.equal(attempt.exercise,'shallow-copy-nested-v1');
 assert.equal(attempt.language,'javascript');assert.equal(attempt.answerId,'b');assert.equal(attempt.correct,true);assert.equal(attempt.assessmentSource,'curated');
 assert.equal(attempt.reviewAt,'2026-10-03T00:00:00.000Z');
 assert(learning.saveLearning(s,'p',records));assert.deepEqual(learning.loadLearning(s,'p'),records);
 const context=learning.learningContext(records,'Mutation and shallow copies');
 assert.equal(context.attempts.length,2);
 assert.equal(context.attempts[1].assessmentSource,'curated');assert.equal(context.attempts[1].exercise,attempt.exercise);
 assert.equal(learning.suggestLesson(records,'2026-10-01T00:00:00Z').exercise,attempt.exercise);
});
test('learning groups curated variants by stable concept ID and preserves incorrect checks',()=>{
 const first=learning.recordAttempt([],{concept:'Mutation',conceptId:'shallow-copy',exercise:'shallow-copy-nested-v1',assessmentSource:'curated',correct:false,answer:'1 and 2',assessment:'needs-practice'},'2026-09-28T00:00:00Z');
 const records=learning.recordAttempt(first,{concept:'Mutation and shallow copies',conceptId:'shallow-copy',exercise:'shallow-copy-array-v1',assessmentSource:'curated',correct:true,answer:'2 and 3',assessment:'developing'},'2026-10-01T00:00:00Z');
 assert.equal(first[0].correct,false);
 assert.equal(learning.suggestLesson(records,'2026-10-01T00:00:00Z').exercise,'shallow-copy-array-v1');
 assert.equal(learning.learningContext(records,'shallow-copy').attempts.length,2);
});
test('concept grouping does not combine explicit non-JavaScript source history with curated JavaScript',()=>{
 let rows=[];
 for(const input of [{language:'python',path:'src/work.py'},{path:'src/work.go'},{language:'javascript',path:'src/work.js'},{language:'typescript',path:'src/work.ts'}]){
  rows=learning.recordAttempt(rows,{concept:'Mutation',answer:'source answer',assessment:'needs-practice',...input},'2026-09-28T00:00:00Z');
 }
 rows=learning.recordAttempt(rows,{concept:'Mutation and shallow copies',conceptId:'shallow-copy',language:'javascript',exercise:'shallow-copy-nested-v1',assessmentSource:'curated',answer:'2 and 2',assessment:'developing'},'2026-10-01T00:00:00Z');
 const context=learning.learningContext(rows,'shallow-copy');
 assert.equal(context.attempts.length,3);
 assert.deepEqual(context.attempts.map(attempt=>attempt.language),['javascript','typescript','javascript']);
 assert.equal(learning.suggestLesson(rows,'2026-10-01T00:00:00Z').language,'python');
});
