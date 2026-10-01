import test from 'node:test';
import assert from 'node:assert/strict';
import * as evidence from '../src/evidence.js';

const item={claim:'The function returns a trimmed string.',evidence:[{path:'main.js',line:2}]};
const message={revision:'r1',evidence:[{path:'main.js',hash:'h1',start:1,end:4}]};
const files=[{path:'main.js',hash:'h1'}];
const input={kind:'claim',item,message,method:'source',steps:'Read the return statement.',expected:'The result uses trim().',observed:'The return expression calls trim().',outcome:'supports',confirmed:true};

test('checked citations and model supplied verification fields cannot promote a suggestion',()=>{
 const fake={...item,trust:'independently-verified',verified:true};
 assert.equal(evidence.evidenceLevel([], 'claim',fake,message,files).level,'suggestion');
});
test('source checks require actual observations and a user attestation',()=>{
 assert.throws(()=>evidence.recordEvidence([],{...input,observed:''},files),/observ/i);
 assert.throws(()=>evidence.recordEvidence([],{...input,confirmed:false},files),/confirm/i);
 const records=evidence.recordEvidence([],input,files,'2026-10-01T00:00:00Z');
 assert.equal(evidence.evidenceLevel(records,'claim',item,message,files).level,'source-supported');
 assert.equal(records[0].provenance,'user-reported');
 assert.equal(evidence.evidenceLevel(records,'finding',{title:'Other claim',evidence:item.evidence},message,files).level,'suggestion');
});
test('independent verification needs a check reference and cannot be inferred from another AI answer',()=>{
 assert.throws(()=>evidence.recordEvidence([],{...input,method:'independent',artifact:''},files),/reference|output/i);
 const records=evidence.recordEvidence([],{...input,method:'independent',artifact:'trim.test.js: expected abc, observed abc; local run',steps:'Ran a specific isolated test.'},files);
 assert.equal(evidence.evidenceLevel(records,'claim',item,message,files).level,'independently-verified');
 assert.equal(records[0].method,'independent');
});
test('changed supporting source, historical answers and contradictory observations remove promotion',()=>{
 const records=evidence.recordEvidence([],input,files);
 assert.equal(evidence.evidenceLevel(records,'claim',item,message,[{path:'main.js',hash:'h2'}]).level,'suggestion');
 assert.equal(evidence.evidenceLevel(records,'claim',item,{...message,historical:true},files).level,'suggestion');
 assert.throws(()=>evidence.recordEvidence([],input,[{path:'main.js',hash:'h2'}]),/source|current/i);
 const contradicted=evidence.recordEvidence(records,{...input,outcome:'contradicts',observed:'The actual value remained unchanged.'},files);
 assert.equal(evidence.evidenceLevel(contradicted,'claim',item,message,files).level,'suggestion');
 assert.equal(evidence.evidenceLevel(contradicted,'claim',item,message,files).record.outcome,'contradicts');
});
test('an unrelated revision change preserves an attestation whose supporting files are identical',()=>{
 const records=evidence.recordEvidence([],input,files);
 assert.equal(evidence.evidenceLevel(records,'claim',item,{...message,revision:'r2'},[...files,{path:'README.md',hash:'changed'}]).level,'source-supported');
});
test('claims without checkable source cannot be promoted, and corrupt storage is ignored',()=>{
 assert.throws(()=>evidence.recordEvidence([],{...input,item:{claim:'Unsupported',evidence:[]}},files),/source/i);
 assert.deepEqual(evidence.loadEvidence({getItem:()=>'{broken'},'p'),[]);
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 const records=evidence.recordEvidence([],input,files);assert.equal(evidence.saveEvidence(storage,'p',records),true);
 assert.equal(evidence.loadEvidence(storage,'p').length,1);
 assert.equal(evidence.loadEvidence(storage,'other').length,0);
});

test('a reused finding or recommendation title cannot inherit a check for a different assertion',()=>{
 for(const [kind,before,after] of [
  ['finding',{title:'Input risk',trigger:'Empty input',consequence:'Throws'},{title:'Input risk',trigger:'Any input',consequence:'Deletes data'}],
  ['recommendation',{title:'Share logic',change:'Extract the pure trim helper',tradeoff:'Adds a module'},{title:'Share logic',change:'Remove validation completely',tradeoff:'Allows invalid input'}],
  ['claim',{claim:'Safe with a guard',assumptions:['Input is a string']},{claim:'Safe with a guard',assumptions:['All input is allowed']}],
 ]){
  const original={...before,evidence:item.evidence},changed={...after,evidence:item.evidence};
  const records=evidence.recordEvidence([],{...input,kind,item:original},files);
  assert.equal(evidence.evidenceLevel(records,kind,original,message,files).level,'source-supported');
  assert.equal(evidence.evidenceLevel(records,kind,changed,message,files).level,'suggestion');
 }
});
