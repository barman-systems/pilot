import test from 'node:test';
import assert from 'node:assert/strict';
import {assertFactRetentionV3,assertFinalResponseSourceV3,brainResponseV3,V3_RESPONSE_SOURCE} from '../api/_dabbir-conversation-v3-invariants.js';

const verified=(field,value)=>({field,status:'VERIFIED',value,source:'CUSTOMER_STATED',confidence:1});

test('V3 fact retention: confirmed fact cannot disappear without invalidation reason',()=>{
  const before={facts:[verified('service','svc-1'),verified('vehicle','station')],invalidations:[]};
  const after={facts:[verified('service','svc-1')],invalidations:[]};
  assert.throws(()=>assertFactRetentionV3({before,after}),e=>e?.code==='V3_FACT_RETENTION_VIOLATION'&&e.lost?.[0]?.field==='vehicle');
});

test('V3 fact retention: explicit invalidation authorizes removal',()=>{
  const before={facts:[verified('vehicle','station')],invalidations:[]};
  const after={facts:[],invalidations:[{field:'vehicle',reason:'CUSTOMER_CORRECTION'}]};
  assert.equal(assertFactRetentionV3({before,after}),after);
});

test('V3 response ownership: only Conversation Brain may create a final response',()=>{
  assert.throws(()=>assertFinalResponseSourceV3({source:'TURN_UNDERSTANDING_V3',text:'hello'}),e=>e?.code==='V3_NON_BRAIN_RESPONSE_SOURCE');
  const response=brainResponseV3({text:'hello'});
  assert.equal(response.source,V3_RESPONSE_SOURCE);
  assert.equal(response.text,'hello');
});
