import test from 'node:test';
import assert from 'node:assert/strict';
import {availabilityProbePlan,findOptionsWithExistingAvailability} from '../api/_dabbir-v3-find-options-adapter.js';
const state=(facts)=>({facts:facts.map(([field,value])=>({field,value,status:'VERIFIED'}))});

test('existing availability can be reused for exact grounded constraints',async()=>{
  const s=state([['service','svc-1'],['date','2026-09-16'],['time','07:00']]);
  const plan=availabilityProbePlan({request:{hard_constraints:[]},state:s});
  assert.equal(plan.requested_local,'2026-09-16T07:00:00');
  const out=await findOptionsWithExistingAvailability({request:{hard_constraints:[]},state:s,context:{business:{id:'b'},conversation:{id:'c'}},readAvailability:async()=>({state:'SLOTS_AVAILABLE',slots:[{local_start:'2026-09-16T07:00:00',service_id:'svc-1'}]})});
  assert.equal(out.state,'OPTIONS_FOUND');
  assert.equal(out.candidates.length,1);
});

test('not_before is a hard numeric constraint and may seed a read',()=>{
  const s=state([['service','svc-1'],['date','2026-09-16']]);
  const plan=availabilityProbePlan({request:{hard_constraints:[{kind:'not_before',value:'07:00'}]},state:s});
  assert.equal(plan.requested_local,'2026-09-16T07:00:00');
});

test('semantic early-morning preference never becomes an invented clock boundary',()=>{
  const s=state([['service','svc-1'],['date','2026-09-16']]);
  const plan=availabilityProbePlan({request:{preferences:[{kind:'semantic',evidence:'أول الصباح'}]},state:s});
  assert.equal(plan.ok,false);
  assert.equal(plan.state,'NEED_BROADER_AVAILABILITY_READ');
  assert.equal(JSON.stringify(plan).includes('06:00'),false);
});

test('adapter cannot search without grounded service/date',()=>{
  assert.equal(availabilityProbePlan({request:{},state:state([])}).state,'NEED_GROUNDED_SERVICE');
  assert.equal(availabilityProbePlan({request:{},state:state([['service','svc-1']])}).state,'NEED_GROUNDED_DATE');
});
