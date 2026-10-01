const key=id=>'atlas-evidence-'+id;
const text=(value,max=6000)=>typeof value==='string'?value.trim().slice(0,max):'';
const kinds=new Set(['claim','finding','recommendation']);
const methods=new Set(['source','independent']);
const outcomes=new Set(['supports','contradicts','inconclusive']);

function support(message){
 const files=message.dependencies?.files||message.evidence||[];
 return [...new Map(files.filter(f=>typeof f.path==='string'&&typeof f.hash==='string'&&f.hash).map(f=>[f.path,{path:f.path,hash:f.hash}])).values()].sort((a,b)=>a.path.localeCompare(b.path));
}
export function evidenceIdentity(kind,item,message){
 const fields=['claim','title','trigger','consequence','reason','change','benefit','tradeoff','category','severity','assumptions','unknowns','verification','missingTests'];
 const assertion=Object.fromEntries(fields.filter(field=>item[field]!==undefined).map(field=>[field,Array.isArray(item[field])?item[field].slice(0,12).map(value=>text(value)):text(item[field])]));
 return JSON.stringify({kind,assertion,evidence:item.evidence||[],files:support(message),context:message.dependencies?.fingerprint||''});
}
function current(item,message,files){
 if(message.historical||message.freshness==='historical'||message.freshness==='unknown')return false;
 const supporting=support(message),refs=item.evidence||[];
 return refs.length>0&&refs.every(r=>supporting.some(f=>f.path===r.path))&&supporting.length>0&&supporting.every(f=>files.some(now=>now.path===f.path&&now.hash===f.hash));
}
export function evidenceLevel(records,kind,item,message,files){
 const id=evidenceIdentity(kind,item,message);
 const record=[...records].reverse().find(r=>r.id===id);
 if(!record||!current(item,message,files)||record.provenance!=='user-reported'||record.confirmed!==true||record.outcome!=='supports')return {level:'suggestion',record};
 if(record.method==='independent'&&text(record.artifact)&&text(record.steps)&&text(record.expected)&&text(record.observed))return {level:'independently-verified',record};
 if(record.method==='source'&&text(record.steps)&&text(record.expected)&&text(record.observed))return {level:'source-supported',record};
 return {level:'suggestion',record};
}
export function recordEvidence(records,input,files,now=new Date().toISOString()){
 if(!kinds.has(input.kind)||!methods.has(input.method)||!outcomes.has(input.outcome))throw new Error('Choose a supported check and outcome.');
 if(input.confirmed!==true)throw new Error('Confirm that you performed this check yourself.');
 if(!current(input.item,input.message,files))throw new Error('Current supporting source is required. Refresh and generate a current answer before recording evidence.');
 if(!text(input.steps)||!text(input.expected)||!text(input.observed))throw new Error('Describe the check, expected behavior, and observed result.');
 if(input.method==='independent'&&!text(input.artifact))throw new Error('Add the test output or a reference to your independent check.');
 const record={id:evidenceIdentity(input.kind,input.item,input.message),kind:input.kind,statement:text(input.item.claim||input.item.title),files:support(input.message),method:input.method,outcome:input.outcome,steps:text(input.steps),expected:text(input.expected),observed:text(input.observed),artifact:text(input.artifact),confirmed:true,provenance:'user-reported',date:now};
 return [...records,record].slice(-200);
}
export function loadEvidence(storage,id){try{const records=JSON.parse(storage.getItem(key(id))||'[]');return Array.isArray(records)?records.filter(r=>r&&typeof r.id==='string'&&r.provenance==='user-reported'&&methods.has(r.method)&&outcomes.has(r.outcome)).slice(-200):[];}catch{return [];}}
export function saveEvidence(storage,id,records){try{storage.setItem(key(id),JSON.stringify(records.slice(-200)));return true;}catch{return false;}}
