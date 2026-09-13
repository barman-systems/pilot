import test from 'node:test';
import assert from 'node:assert/strict';
import {applyActivityRequirements} from '../api/_dabbir-activity-intelligence.js';

const businessId='10000000-0000-4000-8000-000000000001';
const branchId='20000000-0000-4000-8000-000000000001';
const serviceId='30000000-0000-4000-8000-000000000001';
const customerId='40000000-0000-4000-8000-000000000001';
const conversationId='50000000-0000-4000-8000-000000000001';

function context(){
  return {
    business:{id:businessId,business_type:'car_wash'},
    conversation:{id:conversationId,branch_id:branchId},
    customer:{id:customerId},
    services:[{id:serviceId,business_id:businessId,branch_id:branchId,name_ar:'خارجي'}],
    activity_profile:{
      version:1,source:'DATABASE_FACT',business_id:businessId,branch_id:branchId,workers:[],verified_memory:[],
      services:[{
        business_id:businessId,branch_id:branchId,service_id:serviceId,activity_type:'car_wash',schema_version:1,contract_version:'regression-v1',
        delivery_modes:['MOBILE'],mode_requirements:{MOBILE:{required:['vehicle'],optional:[]}},
        collection_priority:['service','delivery_mode','vehicle','location','branch','date','time','worker','slot'],
        entity_definitions:{vehicle:{values:['saloon','station']}},supported_actions:['CHECK_AVAILABILITY','CREATE_BOOKING'],automatic_booking:true,owner_approval:false,
      }],
    },
  };
}

function state(mode,unresolved=[]){
  return {
    scope:{business_id:businessId,branch_id:branchId,customer_id:customerId,conversation_id:conversationId},
    entities:{
      service:{value:serviceId,source:'CUSTOMER_STATED',confidence:.99,status:'active'},
      branch:{value:branchId,source:'DATABASE_FACT',confidence:1,status:'active'},
      ...(mode?{delivery_mode:mode}:{}),
    },
    unresolved_references:[...unresolved],
  };
}

test('single database-authorized delivery mode outranks an identical ungrounded model guess',()=>{
  const s=state({value:'MOBILE',source:'AI_INFERENCE',confidence:.5,status:'active',service_id:serviceId});
  const resolution=applyActivityRequirements(s,context(),new Date('2026-09-10T04:00:00Z'));

  assert.equal(s.entities.delivery_mode.value,'MOBILE');
  assert.equal(s.entities.delivery_mode.source,'DATABASE_FACT');
  assert.equal(s.entities.delivery_mode.confidence,1);
  assert.equal(s.entities.delivery_mode.service_id,serviceId);
  assert.ok(!resolution.missing.includes('delivery_mode'));
  assert.equal(resolution.missing[0],'vehicle');
  assert.ok(resolution.required.includes('location'));
});

test('an explicit conflicting delivery-mode request remains unresolved instead of being silently overwritten',()=>{
  const s=state({value:'AT_BUSINESS',source:'AI_INFERENCE',confidence:.5,status:'active',service_id:serviceId},['delivery_mode']);
  const resolution=applyActivityRequirements(s,context(),new Date('2026-09-10T04:00:00Z'));

  assert.equal(s.entities.delivery_mode.value,'AT_BUSINESS');
  assert.equal(s.entities.delivery_mode.source,'AI_INFERENCE');
  assert.deepEqual(resolution.missing,['delivery_mode']);
  assert.deepEqual(resolution.required,['delivery_mode']);
});
