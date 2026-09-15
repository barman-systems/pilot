import test from 'node:test';
import assert from 'node:assert/strict';
import {availabilityProbePlan,findOptionsWithExistingAvailability} from '../api/_dabbir-v3-find-options-adapter.js';
const state=(facts)=>({facts:facts.map(([field,value])=>({field,value,status:'VERIFIED'}))});

test('existing availability is reused for exact grounded constraints',async()=>{
  const s=state([['service','svc-1'],['date','2026-09-16'],['time','07:00']]);
  const plan=availabilityProbePlan({request:{hard_constraints:[]},state:s});
  assert.equal(plan.mode,'EXACT');assert.equal(plan.requested_local,'2026-09-16T07:00:00');
  const out=await findOptionsWithExistingAvailability({request:{hard_constraints:[]},state:s,context:{business:{id:'b'},conversation:{id:'c'}},readAvailability:async()=>({state:'SLOTS_AVAILABLE',slots:[{local_start:'2026-09-16T07:00:00',service_id:'svc-1'}]})});
  assert.equal(out.state,'OPTIONS_FOUND');assert.equal(out.candidates.length,1);
});

test('hard not-before becomes a bound on broad read, not an invented exact appointment',()=>{
  const s=state([['service','svc-1'],['date','2026-09-16']]);
  const plan=availabilityProbePlan({request:{hard_constraints:[{kind:'not_before',value:'07:00'}]},state:s});
  assert.equal(plan.mode,'BROAD');assert.equal(plan.from,'07:00');assert.equal(plan.requested_local,undefined);
});

test('semantic early-morning preference reaches broad ground truth without invented clock boundary',async()=>{
  const s=state([['service','svc-1'],['date','2026-09-16']]);
  const request={preferences:[{kind:'semantic',evidence:'أول الصباح'}]};
  const plan=availabilityProbePlan({request,state:s});
  assert.equal(plan.ok,true);assert.equal(plan.mode,'BROAD');assert.equal(plan.from,null);assert.equal(plan.to,null);
  assert.equal(JSON.stringify(plan).includes('06:00'),false);
  const out=await findOptionsWithExistingAvailability({request,state:s,context:{business:{id:'b'},conversation:{id:'c'}},readBroadAvailability:async args=>({state:'OPTIONS_FOUND',slots:[{local_start:`${args.requested_date}T07:30:00`,service_id:'svc-1'}]})});
  assert.equal(out.state,'OPTIONS_FOUND');assert.equal(out.candidates[0].local_start,'2026-09-16T07:30:00');
});

test('adapter cannot search without grounded service/date',()=>{
  assert.equal(availabilityProbePlan({request:{},state:state([])}).state,'NEED_GROUNDED_SERVICE');
  assert.equal(availabilityProbePlan({request:{},state:state([['service','svc-1']])}).state,'NEED_GROUNDED_DATE');
});
