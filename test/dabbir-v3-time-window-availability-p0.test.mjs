import test from 'node:test';
import assert from 'node:assert/strict';
import {_v3RuntimeTest} from '../api/_dabbir-conversation-v3-runtime.js';

const ids={business:'10000000-0000-4000-8000-000000000001',conversation:'30000000-0000-4000-8000-000000000001',service:'50000000-0000-4000-8000-000000000001'};
const fact=(field,value,source='CUSTOMER_STATED')=>({field,value,status:'VERIFIED',source,confidence:1});

test('grounded dayparts map to bounded read-only availability search windows',()=>{
  const cases={
    EARLY_MORNING:['05:00','07:59'],
    MORNING:['08:00','11:59'],
    AFTERNOON:['12:00','16:59'],
    EVENING:['17:00','20:59'],
    NIGHT:['21:00','23:59'],
  };
  for(const [name,[from,to]] of Object.entries(cases)){
    assert.deepEqual(_v3RuntimeTest.timeWindowRange({facts:[fact('time_window',name,'CUSTOMER_CORRECTION')]}),{name,from,to});
  }
  assert.equal(_v3RuntimeTest.timeWindowRange({facts:[]}),null);
});

test('live regression: الظهر never returns morning slots after the customer corrects the time window',async()=>{
  const calls=[];
  const at=new Date('2026-09-15T21:36:13Z');
  const state={facts:[
    fact('service',ids.service,'CUSTOMER_CONFIRMED'),
    fact('date','2026-09-16'),
    fact('time_window','AFTERNOON','CUSTOMER_CORRECTION'),
  ]};
  const context={business:{id:ids.business,timezone:'Asia/Dubai'},conversation:{id:ids.conversation}};
  const rpc=async(name,args)=>{
    assert.equal(name,'dabbir_whatsapp_ai_find_available_options_v1');
    calls.push(args);
    return {state:'OPTIONS_FOUND',slots:[
      {starts_at:'2026-09-16T04:00:00Z',local_start:'2026-09-16T08:00:00',service_id:ids.service},
      {starts_at:'2026-09-16T09:00:00Z',local_start:'2026-09-16T13:00:00',service_id:ids.service},
      {starts_at:'2026-09-16T10:30:00Z',local_start:'2026-09-16T14:30:00',service_id:ids.service},
    ]};
  };
  const result=await _v3RuntimeTest.discoverAvailability({rpc,state,context,at});
  assert.equal(calls.length,1);
  assert.equal(calls[0].p_requested_date,'2026-09-16');
  assert.equal(calls[0].p_from,'12:00');
  assert.equal(calls[0].p_to,'16:59');
  assert.equal(result.time_window,'AFTERNOON');
  assert.deepEqual(result.slots.map(slot=>slot.local_start),['2026-09-16T13:00:00','2026-09-16T14:30:00']);
  assert.equal(result.slots.some(slot=>slot.local_start.includes('T08:00')),false);
});

test('general availability discovery remains broad when no time window is grounded',async()=>{
  const calls=[];
  const at=new Date('2026-09-15T21:35:35Z');
  const state={facts:[fact('service',ids.service,'CUSTOMER_CONFIRMED'),fact('date','2026-09-16')]};
  const context={business:{id:ids.business,timezone:'Asia/Dubai'},conversation:{id:ids.conversation}};
  const rpc=async(_name,args)=>{calls.push(args);return {state:'OPTIONS_FOUND',slots:[{starts_at:'2026-09-16T04:00:00Z',local_start:'2026-09-16T08:00:00',service_id:ids.service}]};};
  const result=await _v3RuntimeTest.discoverAvailability({rpc,state,context,at});
  assert.equal(calls[0].p_from,null);
  assert.equal(calls[0].p_to,null);
  assert.equal(result.time_window,null);
  assert.equal(result.slots.length,1);
});
