import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {understandConversation} from '../api/_dabbir-semantic-engine-core.js';
import {activityContext} from './fixtures/understanding/activity.mjs';

const ids={
  business:'20000000-0000-4000-8000-000000000001',
  conversation:'30000000-0000-4000-8000-000000000001',
  customer:'40000000-0000-4000-8000-000000000001',
  branch:'50000000-0000-4000-8000-000000000001',
  vip:'60000000-0000-4000-8000-000000000001',
  exterior:'60000000-0000-4000-8000-000000000002',
  normal:'60000000-0000-4000-8000-000000000003',
};
const services=[
  {id:ids.vip,business_id:ids.business,branch_id:ids.branch,name_ar:'Vip',price:100,duration_minutes:50},
  {id:ids.exterior,business_id:ids.business,branch_id:ids.branch,name_ar:'خارجي',price:40,duration_minutes:20},
  {id:ids.normal,business_id:ids.business,branch_id:ids.branch,name_ar:'عادي',price:60,duration_minutes:30},
];
const now=new Date('2026-09-09T13:52:00Z');
function context(body,pending_state=null){
  return activityContext({
    business:{id:ids.business,timezone:'Asia/Dubai',business_type:'car_wash',currency_code:'AED'},
    conversation:{id:ids.conversation,branch_id:ids.branch,state:'ai_active'},
    customer:{id:ids.customer},services,workers:[],upcoming_appointments:[],history:[],knowledge:[],verified_memory:[],approved_aliases:[],branches:[{id:ids.branch,name:'Main'}],location_receipts:[],pending_state,
    batch_messages:[{id:'70000000-0000-4000-8000-000000000001',body,language_body:body}],
  });
}

test('live reproduction: service duration after a menu is a DB-grounded detail, not another menu',()=>{
  const first=understandConversation({context:context('شو خدماتكم'),now});
  assert.equal(first.decision.action,'SERVICE_MENU');
  assert.equal(first.state.intent,'SERVICE_DISCOVERY');
  const adversarial={intent:'SERVICE_DISCOVERY',action:'SERVICE_MENU',confidence:.99,riskLevel:'LOW',entities:[]};
  const second=understandConversation({context:context('غسيل عادي كم الوقت؟'),previous:first.state,now:new Date(now.getTime()+1000),proposal:adversarial});
  assert.equal(second.decision.action,'REPLY');
  assert.equal(second.decision.reasonCode,'DATABASE_SERVICE_DURATION');
  assert.match(second.decision.reply,/عادي/);
  assert.match(second.decision.reply,/30/);
  assert.equal(second.state.goal,'UNKNOWN');
  assert.equal(second.state.intent,'SUPPORT');
  assert.equal(second.state.entities.service.value,ids.normal);
  assert.equal(second.state.entities.time,undefined);
});

test('read-only catalog intent is turn-scoped: exact next service starts the booking journey instead of repeating the menu',()=>{
  const first=understandConversation({context:context('شو خدماتكم'),now});
  const second=understandConversation({context:context('عادي'),previous:first.state,now:new Date(now.getTime()+1000)});
  assert.equal(second.state.goal,'BOOK_SERVICE');
  assert.equal(second.state.intent,'BOOKING');
  assert.equal(second.state.entities.service.value,ids.normal);
  assert.notEqual(second.decision.action,'SERVICE_MENU');
});

test('unverified numeric service reply cannot poison time while presentation proof is missing',()=>{
  const first=understandConversation({context:context('شو خدماتكم'),now});
  const pending={pending_action:'choose_service',expires_at:'2026-09-09T14:07:00Z',payload:{presented:false,services:services.map(s=>({id:s.id,label:s.name_ar}))}};
  const second=understandConversation({context:context('3',pending),previous:first.state,now:new Date(now.getTime()+1000)});
  assert.equal(second.state.entities.time,undefined);
  assert.equal(second.state.entities.service,undefined);
  assert.ok(second.state.unresolved_references.includes('offered_option'));
  assert.notEqual(second.decision.action,'CREATE_BOOKING');
});

test('migration makes provider acceptance and pending option presentation one transaction without weakening semantic scope',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20260909144318_dabbir_atomic_cognitive_presentation_v1.sql',import.meta.url),'utf8');
  assert.match(sql,/state='PROVIDER_ACCEPTED'/);
  assert.match(sql,/semantic_batch_id=v_understanding_batch/);
  assert.match(sql,/pending_action='choose_service' and v_purpose='reply'/);
  assert.match(sql,/pending_action='choose_slot' and v_purpose='availability'/);
  assert.match(sql,/pending_action='choose_appointment' and v_purpose='clarify'/);
  assert.match(sql,/jsonb_build_object\('presented',true,'provider_message_id',v_provider_id\)/);
  assert.match(sql,/r\.message_id is not null and r\.finalized_at is not null/);
  assert.match(sql,/r\.idempotency_key like 'wa-understanding:'\|\|b\.id::text\|\|':%'/);
  assert.match(sql,/understanding_assert_batch_v2\(p_batch_id,p_lock_token\)/);
  assert.doesNotMatch(sql,/grant execute on function public\.dabbir_whatsapp_finalize_outbound[^;]+to authenticated/);
});
