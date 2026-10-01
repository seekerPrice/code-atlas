import {matchConcept} from './exercises.js';

const key=id=>'atlas-learning-'+id;
const text=(v,n=4000)=>typeof v==='string'?v.slice(0,n):'';
const assessments=new Set(['not-assessed','needs-practice','developing','supported']);
const delayDays=a=>a==='supported'?7:a==='developing'?2:1;
function conceptKey(record){
 const language=text(record.language,160).toLowerCase();
 const extension=text(record.path,1000).split('/').pop().match(/\.([^.]+)$/)?.[1]?.toLowerCase();
 const javascript=language?['javascript','typescript','js','ts','jsx','tsx'].includes(language):!extension||['js','mjs','cjs','jsx','ts','mts','cts','tsx'].includes(extension);
 const id=javascript&&(record.conceptId||matchConcept(record.concept)?.id);
 return id?'concept:'+id:'source:'+(javascript?'':language||extension||'')+':'+record.concept;
}
function practiceMetadata(input){
 const metadata={};
 for(const field of ['conceptId','exercise','language','answerId'])if(text(input[field],160))metadata[field]=text(input[field],160);
 if(['curated','ai'].includes(input.assessmentSource))metadata.assessmentSource=input.assessmentSource;
 if(typeof input.correct==='boolean')metadata.correct=input.correct;
 return metadata;
}
export function loadLearning(storage,id){try{const rows=JSON.parse(storage.getItem(key(id))||'[]');return Array.isArray(rows)?rows.filter(r=>r&&typeof r.answer==='string'&&typeof r.concept==='string'&&typeof r.date==='string').slice(-200):[];}catch{return [];}}
export function saveLearning(storage,id,rows){try{storage.setItem(key(id),JSON.stringify(rows.slice(-200)));return true;}catch{return false;}}
export function recordAttempt(records,input,now=new Date().toISOString()){
 if(!text(input.answer).trim()||input.assessment==='not-assessed')return records;
 const assessment=assessments.has(input.assessment)?input.assessment:'not-assessed';
 const date=Number.isFinite(Date.parse(now))?new Date(now).toISOString():new Date().toISOString();
 const record={concept:text(input.concept,160)||'Code reasoning',question:text(input.question),answer:text(input.answer),feedback:text(input.feedback),assessment,misconceptions:Array.isArray(input.misconceptions)?input.misconceptions.slice(0,8).map(x=>text(x,500)).filter(Boolean):[],path:text(input.path,1000),symbol:text(input.symbol,1000),revision:text(input.revision,100),date,reviewAt:new Date(Date.parse(date)+delayDays(assessment)*86400000).toISOString(),...practiceMetadata(input)};
 return [...records,record].slice(-200);
}
export function suggestLesson(records,now=new Date().toISOString()){
 const latest=[...new Map(records.map(r=>[conceptKey(r),r])).values()];
 return latest.sort((a,b)=>{
  const aDue=Date.parse(a.reviewAt||a.date)<=Date.parse(now),bDue=Date.parse(b.reviewAt||b.date)<=Date.parse(now);
  return Number(bDue)-Number(aDue)||({ 'needs-practice':0,developing:1,'not-assessed':2,supported:3}[a.selfAssessment||a.assessment]??2)-({'needs-practice':0,developing:1,'not-assessed':2,supported:3}[b.selfAssessment||b.assessment]??2)||Date.parse(a.reviewAt||a.date)-Date.parse(b.reviewAt||b.date);
 })[0]||null;
}
export function learningContext(records,concept=''){
 const selected=concept||suggestLesson(records)?.concept||'Code reasoning';
 const selectedRecord=[...records].reverse().find(r=>r.concept===selected||r.conceptId===selected);
 const selectedKey=conceptKey(selectedRecord||{concept:selected});
 const matching=records.filter(r=>conceptKey(r)===selectedKey).slice(-4);
 return {concept:selectedRecord?.concept||selected,misconceptions:[...new Set(matching.flatMap(r=>r.misconceptions||[]))].slice(0,8),attempts:matching.map(r=>({concept:r.concept,question:text(r.question,1000),answer:text(r.answer,1500),feedback:text(r.feedback,1000),assessment:r.selfAssessment||r.assessment,...practiceMetadata(r)}))};
}
