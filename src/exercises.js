// Authored examples only: this module selects and compares data; it never runs code.
const concepts=[
 {id:'shallow-copy',title:'Mutation and shallow copies',match:/\b(?:shallow cop(?:y|ies|ying)|mutations?|mutability|immutability|object spread)\b/},
 {id:'runtime-validation',title:'Runtime validation and guards',match:/\b(?:runtime (?:input )?validation|input validation|runtime (?:type )?guards?|type guards?|guard clauses?)\b/},
 {id:'async-errors',title:'Async errors and promise rejections',match:/\b(?:async(?:hronous)? (?:errors?|error handling)|async await|promise rejections?|rejected promises?)\b/},
 {id:'reference-equality',title:'Reference equality',match:/\b(?:reference equality|object identity|object equality|array equality|reference identity)\b/},
 {id:'nullish-defaults',title:'Nullish defaults',match:/\b(?:nullish (?:coalescing|defaults?)|nullish coalescing operator|falsy defaults?)\b/},
 {id:'array-transform',title:'Array map and filter',match:/\b(?:array (?:map|filter|transformations?|transforms?)|map and filter|map filter)\b/},
 {id:'closures',title:'Closures and lexical scope',match:/\b(?:closures?|lexical scop(?:e|ing))\b/},
];

// Do not transfer these JavaScript rules to another language or framework-specific topic.
const unsupported=/\b(?:python|rust|java|csharp|c|ruby|php|swift|kotlin|go|golang|lua|scala|haskell|elixir|erlang|perl|dart|julia|r|sql|database|graphql|react|redux|vue|angular|css|dom|mutation testing|mutation observer)\b/;
const metadata=concept=>({id:concept.id,title:concept.title,language:'javascript'});
export function matchConcept(value){
 if(typeof value!=='string'||value.length>240)return null;
 const normalized=value.toLowerCase().trim().replace(/[_/–—-]+/g,' ').replace(/\s+/g,' ');
 if(unsupported.test(normalized))return null;
 const exact=concepts.find(concept=>concept.id===value||concept.title.toLowerCase()===normalized);
 if(exact)return metadata(exact);
 // Bare validation is an established lesson label; more specific unknown validation stays unavailable.
 if(normalized==='validation')return metadata(concepts[1]);
 const matches=concepts.filter(concept=>concept.match.test(normalized));
 return matches.length===1?metadata(matches[0]):null;
}
export function listExerciseConcepts(language='javascript'){
 return language==='javascript'?concepts.map(metadata):[];
}

const exercises=[
 {
  id:'shallow-copy-nested-v1',conceptId:'shallow-copy',
  code:`const original = { profile: { score: 1 } };
const copy = { ...original };
copy.profile.score = 2;
console.log(original.profile.score, copy.profile.score);`,
  question:'What are the two scores printed, in order?',
  options:['1 and 2','2 and 2','1 and 1'],correct:'b',
  explanation:'Object spread makes a new outer object, but the nested profile object is shared. Changing copy.profile.score also changes the score seen through original.profile. Both scores are 2.',
 },
 {
  id:'shallow-copy-array-v1',conceptId:'shallow-copy',
  code:`const values = [1, 2];
const other = values.slice();
other.push(3);
console.log(values.length, other.length);`,
  question:'What are the two array lengths printed, in order?',
  options:['3 and 3','2 and 2','2 and 3'],correct:'c',
  explanation:'slice() creates a separate array. Pushing a top-level item changes only other, so values stays at length 2 and other grows to length 3. A shallow copy still shares nested object references, if any are present.',
 },
 {
  id:'runtime-validation-number-v1',conceptId:'runtime-validation',
  code:`const isCount = value =>
  typeof value === 'number' && Number.isFinite(value);
console.log([isCount('3'), isCount(3)]);`,
  question:'Which array is printed?',
  options:['[true,true]','[false,true]','[false,false]'],correct:'b',
  explanation:'Runtime validation checks the actual value. The string "3" fails the number check; the number 3 passes both checks. This guard does not convert strings into numbers.',
 },
 {
  id:'runtime-validation-guard-v1',conceptId:'runtime-validation',
  code:`const readName = value =>
  value !== null &&
  typeof value === 'object' &&
  typeof value.name === 'string'
    ? value.name
    : 'unknown';
console.log([readName(null), readName({ name: 'Ada' })]);`,
  question:'Which array is printed?',
  options:['["unknown","Ada"]','[null,"Ada"]','It throws while reading null.name'],correct:'a',
  explanation:'The null check comes first. Because && short-circuits, null never reaches value.name and returns "unknown". The object with a string name passes all checks and returns "Ada".',
 },
 {
  id:'async-errors-fallback-v1',conceptId:'async-errors',
  code:`async function read() {
  try {
    return await Promise.reject(new Error('offline'));
  } catch {
    return 'fallback';
  }
}
console.log(await read());`,
  question:'In a JavaScript module, what is printed?',
  options:['offline','An unhandled rejection; nothing is printed','fallback'],correct:'c',
  explanation:'await turns the rejected promise into a thrown error inside this try block. The catch returns "fallback", so read() fulfills with that string. Awaiting read() prints fallback.',
 },
 {
  id:'async-errors-finally-v1',conceptId:'async-errors',
  code:`const events = [];
try {
  events.push('start');
  await Promise.reject(new Error('offline'));
  events.push('after');
} catch {
  events.push('caught');
} finally {
  events.push('done');
}
console.log(events.join(', '));`,
  question:'In a JavaScript module, which event order is printed?',
  options:['start, caught, done','start, after, caught, done','start, done'],correct:'a',
  explanation:'The rejected promise throws at await, skipping "after". The catch appends "caught", and the finally block runs afterward and appends "done".',
 },
 {
  id:'reference-equality-object-v1',conceptId:'reference-equality',
  code:`const one = { id: 1 };
const two = { id: 1 };
const same = one;
console.log(one === two, one === same);`,
  question:'What are the two booleans printed, in order?',
  options:['true, true','false, true','false, false'],correct:'b',
  explanation:'Objects compare by identity with ===. one and two are separately created objects even though their contents match. same refers to the very same object as one.',
 },
 {
  id:'reference-equality-array-v1',conceptId:'reference-equality',
  code:`const left = [1, 2];
const right = [1, 2];
console.log(left === right, left[0] === right[0]);`,
  question:'What are the two booleans printed, in order?',
  options:['true, true','false, false','false, true'],correct:'c',
  explanation:'The two arrays have separate identities, so left === right is false. Their first elements are both the primitive number 1, so those elements compare equal.',
 },
 {
  id:'nullish-defaults-zero-v1',conceptId:'nullish-defaults',
  code:`const count = 0;
console.log(count || 10, count ?? 10);`,
  question:'What are the two numbers printed, in order?',
  options:['10, 0','10, 10','0, 0'],correct:'a',
  explanation:'|| uses its fallback for every falsy value, including zero. ?? uses its fallback only for null or undefined, so it preserves zero.',
 },
 {
  id:'nullish-defaults-empty-v1',conceptId:'nullish-defaults',
  code:`const name = '';
console.log([name ?? 'guest', null ?? 'guest']);`,
  question:'Which array is printed?',
  options:['["guest","guest"]','["","guest"]','["",null]'],correct:'b',
  explanation:'An empty string is not null or undefined, so ?? preserves it. The explicit null does use the fallback "guest".',
 },
 {
  id:'array-transform-map-v1',conceptId:'array-transform',
  code:`const numbers = [1, 2, 3];
const result = numbers.map(number => number * 2);
console.log(result);`,
  question:'Which array is printed?',
  options:['[1,2,3]','[2,4]','[2,4,6]'],correct:'c',
  explanation:'map calls the callback for each number and puts each returned value into a new array. Multiplying 1, 2, and 3 by 2 produces [2,4,6].',
 },
 {
  id:'array-transform-filter-v1',conceptId:'array-transform',
  code:`const numbers = [1, 2, 3, 4];
const result = numbers.filter(number => number % 2 === 0);
console.log(result);`,
  question:'Which array is printed?',
  options:['[2,4]','[false,true,false,true]','[0,0]'],correct:'a',
  explanation:'filter keeps the original elements whose predicate is truthy. Only 2 and 4 have remainder zero when divided by 2; the returned array contains those numbers, not the predicate results.',
 },
 {
  id:'closures-binding-v1',conceptId:'closures',
  code:`let count = 0;
const read = () => count;
count = 3;
console.log(read());`,
  question:'What number is printed?',
  options:['0','3','undefined'],correct:'b',
  explanation:'The closure reads the outer count binding when read() is called. It does not freeze the value from when the function was created. count is 3 at the time of the call.',
 },
 {
  id:'closures-loop-v1',conceptId:'closures',
  code:`const readers = [];
for (let index = 0; index < 2; index++) {
  readers.push(() => index);
}
console.log(readers.map(read => read()));`,
  question:'Which array is printed?',
  options:['[2,2]','[1,2]','[0,1]'],correct:'c',
  explanation:'A for loop declared with let creates a separate index binding for each iteration. Each closure keeps its own iteration binding, giving 0 and 1 when the functions run later.',
 },
];
const optionsOf=exercise=>exercise.options.map((label,index)=>({id:String.fromCharCode(97+index),label}));

export function chooseExercise(concept,previousId='',language='javascript'){
 if(language!=='javascript')return null;
 const matched=matchConcept(concept);if(!matched)return null;
 const variants=exercises.filter(exercise=>exercise.conceptId===matched.id);
 const previousIndex=variants.findIndex(exercise=>exercise.id===previousId);
 const selected=variants[(previousIndex+1)%variants.length];if(!selected)return null;
 return {id:selected.id,conceptId:matched.id,concept:matched.title,language,code:selected.code,question:selected.question,options:optionsOf(selected)};
}

export function gradeExercise(id,answerId){
 const exercise=exercises.find(item=>item.id===id);if(!exercise)return null;
 const options=optionsOf(exercise),answer=options.find(option=>option.id===answerId);if(!answer)return null;
 const concept=concepts.find(item=>item.id===exercise.conceptId),correct=answerId===exercise.correct;
 return {exercise:id,conceptId:concept.id,concept:concept.title,language:'javascript',answerId,answer:answer.label,correct,correctAnswer:options.find(option=>option.id===exercise.correct),explanation:exercise.explanation,assessment:correct?'developing':'needs-practice',assessmentSource:'curated'};
}
