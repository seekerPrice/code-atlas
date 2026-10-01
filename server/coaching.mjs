import { validateEvidence } from './exploration.mjs';

const levels=new Set(['high','medium','low']);
const assessments=new Set(['not-assessed','needs-practice','developing','supported']);
const object=value=>value && typeof value==='object' && !Array.isArray(value);
const list=value=>Array.isArray(value)?value:[];

// Location checks establish that a reference was supplied, not that a claim is true.
export function parseCoaching(raw,evidence=[]) {
  const source=typeof raw==='string'?raw.slice(0,2000000):'';
  const excerpts=list(evidence).filter(e=>object(e)&&typeof e.path==='string'&&Number.isInteger(e.start)&&Number.isInteger(e.end));
  const citations={valid:0,invalid:0};
  const checked=(value,max=4000)=>{
    const result=validateEvidence(typeof value==='string'?value.slice(0,max):'',excerpts);
    citations.valid+=result.valid;citations.invalid+=result.invalid;
    return result.text;
  };
  const strings=value=>list(value).filter(v=>typeof v==='string').slice(0,12).map(v=>checked(v,2000));
  const references=value=>{
    const refs=[];let invalidEvidence=0;
    for(const ref of list(value).slice(0,30)) {
      if(object(ref)&&typeof ref.path==='string'&&Number.isInteger(ref.line)&&ref.line>0&&excerpts.some(e=>e.path===ref.path&&ref.line>=e.start&&ref.line<=e.end)) {
        refs.push({path:ref.path,line:ref.line});citations.valid++;
      } else {invalidEvidence++;citations.invalid++;}
    }
    return {evidence:refs,evidenceStatus:refs.length?'location-checked':'missing',invalidEvidence};
  };
  let data;
  try { data=JSON.parse(source.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i,'$1')); } catch {}
  if(!object(data)||typeof data.summary!=='string'||!Array.isArray(data.claims)||!Array.isArray(data.findings)) {
    return {text:checked(source,100000),coaching:null,citations};
  }
  const text=checked(data.summary,24000);
  const claims=data.claims.filter(c=>object(c)&&typeof c.claim==='string'&&c.claim.trim()).slice(0,20).map(c=>{
    const refs=references(c.evidence),unknowns=strings(c.unknowns);
    if(!refs.evidence.length) unknowns.unshift('No valid source evidence was supplied for this claim.');
    return {claim:checked(c.claim),...refs,assumptions:strings(c.assumptions),unknowns};
  });
  const findings=data.findings.filter(f=>object(f)&&['title','trigger','consequence'].every(k=>typeof f[k]==='string'&&f[k].trim())&&levels.has(f.severity)&&levels.has(f.confidence)).slice(0,5).map(f=>{
    const refs=references(f.evidence);
    return {title:checked(f.title,500),severity:f.severity,confidence:refs.evidence.length?f.confidence:'low',trigger:checked(f.trigger),consequence:checked(f.consequence),...refs,verification:strings(f.verification),missingTests:strings(f.missingTests)};
  });
  const categories=new Set(['refactor','duplication','maintainability','performance','testing','clarity']);
  const recommendations=list(data.recommendations).filter(r=>object(r)&&categories.has(r.category)&&levels.has(r.priority)&&levels.has(r.confidence)&&['title','reason','change','benefit','tradeoff'].every(k=>typeof r[k]==='string'&&r[k].trim())).slice(0,5).map(r=>{
    const refs=references(r.evidence);
    refs.evidence=[...new Map(refs.evidence.map(e=>[`${e.path}:${e.line}`,e])).values()];
    const insufficient=r.category==='duplication'&&refs.evidence.length<2;
    const caution=insufficient?'Duplication needs two distinct supplied source locations. Treat this as an unverified suggestion.':!refs.evidence.length?'No supporting source location. Treat this as an unverified suggestion.':'';
    return {title:checked(r.title,500),category:r.category,priority:r.priority,confidence:caution?'low':r.confidence,reason:checked(r.reason),change:checked(r.change),benefit:checked(r.benefit),tradeoff:checked(r.tradeoff),...refs,evidenceStatus:insufficient?'insufficient':refs.evidenceStatus,caution,verification:strings(r.verification)};
  });
  let lesson=null;
  if(object(data.lesson)&&typeof data.lesson.concept==='string'&&data.lesson.concept.trim()) {
    lesson={concept:checked(data.lesson.concept,500),question:checked(data.lesson.question),feedback:checked(data.lesson.feedback),misconceptions:strings(data.lesson.misconceptions),nextExercise:checked(data.lesson.nextExercise),assessment:assessments.has(data.lesson.assessment)?data.lesson.assessment:'not-assessed'};
  }
  return {text,coaching:{claims,findings,recommendations,lesson},citations};
}
