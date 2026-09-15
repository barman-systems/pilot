import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAvailabilitySearchScope,filterGroundedAvailabilityRows} from '../api/_dabbir-v3-availability-search-scope.js';
const state=facts=>({facts:facts.map(([field,value])=>({field,value,status:'VERIFIED'}))});

test('semantic preference opens grounded day read without invented time',()=>{
  const scope=buildAvailabilitySearchScope({request:{preferences:[{kind:'semantic',evidence:'أول الصباح'}]},state:state([['service','svc'],['date','2026-09-16']])});
  assert.equal(scope.ok,true);assert.equal(scope.mode,'DAY');assert.equal(scope.from,null);assert.equal(scope.to,null);assert.equal(scope.read_only,true);assert.equal(JSON.stringify(scope).includes('06:00'),false);
});

test('hard not-before/not-after bounds are enforced as customer authority',()=>{
  const scope=buildAvailabilitySearchScope({request:{hard_constraints:[{kind:'not_before',value:'07:00'},{kind:'not_after',value:'09:00'}]},state:state([['service','svc'],['date','2026-09-16']])});
  const rows=filterGroundedAvailabilityRows([{local_start:'2026-09-16T06:30:00',service_id:'svc'},{local_start:'2026-09-16T07:30:00',service_id:'svc'},{local_start:'2026-09-16T09:30:00',service_id:'svc'}],scope);
  assert.deepEqual(rows.map(x=>x.local_start),['2026-09-16T07:30:00']);
});

test('wrong date/service cannot leak into candidates',()=>{
  const scope=buildAvailabilitySearchScope({request:{},state:state([['service','svc'],['date','2026-09-16']])});
  const rows=filterGroundedAvailabilityRows([{local_start:'2026-09-17T07:30:00',service_id:'svc'},{local_start:'2026-09-16T07:30:00',service_id:'other'},{local_start:'2026-09-16T08:00:00',service_id:'svc'}],scope);
  assert.equal(rows.length,1);assert.equal(rows[0].local_start,'2026-09-16T08:00:00');
});

test('candidate volume is code bounded to truthful broad authority maximum',()=>{
  const scope=buildAvailabilitySearchScope({request:{},state:state([['service','svc'],['date','2026-09-16']]),maxCandidates:999});
  assert.equal(scope.max_candidates,12);
});
