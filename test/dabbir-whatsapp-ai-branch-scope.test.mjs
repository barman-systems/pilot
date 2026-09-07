import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260907103000_dabbir_whatsapp_ai_branch_scope_v1.sql',import.meta.url),'utf8');
const must=(re,msg)=>assert.match(migration,re,msg);

test('WhatsApp AI context exposes only resources from the receiving conversation branch',()=>{
  must(/'branch_id',v_conversation\.branch_id/);
  must(/join public\.dabbir_branch_services bs[\s\S]+bs\.branch_id=v_conversation\.branch_id/);
  must(/join public\.dabbir_worker_branches wb[\s\S]+wb\.branch_id=v_conversation\.branch_id/);
  must(/a\.branch_id=v_conversation\.branch_id[\s\S]+a\.customer_id=v_customer\.id/);
});

test('availability cannot offer a service or worker from another branch',()=>{
  must(/ACTION_SERVICE_NOT_AVAILABLE_IN_BRANCH/);
  must(/ACTION_WORKER_NOT_AVAILABLE_IN_BRANCH/);
  must(/whatsapp_ai_slot_available_branch\(\s*p_business_id,v_conversation\.branch_id/);
  must(/dabbir_worker_branches wb[\s\S]+wb\.branch_id=v_conversation\.branch_id/);
});

test('branch slot helper keeps unassigned work local but prevents one worker double booking across branches',()=>{
  const helper=migration.match(/create or replace function dabbir_private\.whatsapp_ai_slot_available_branch[\s\S]*?grant execute on function dabbir_private\.whatsapp_ai_slot_available_branch/)?.[0]||'';
  assert.ok(helper,'branch-aware slot helper must exist');
  assert.match(helper,/a\.branch_id=p_branch_id and a\.worker_id is null/);
  assert.match(helper,/a\.business_id=p_business_id and a\.worker_id=p_worker_id/);
  assert.doesNotMatch(helper,/a\.branch_id=p_branch_id and a\.worker_id=p_worker_id/);
});

test('AI booking writes the exact conversation branch and returns verified branch identity',()=>{
  const create=migration.match(/create or replace function public\.dabbir_whatsapp_ai_create_booking[\s\S]*?grant execute on function public\.dabbir_whatsapp_ai_create_booking/)?.[0]||'';
  assert.ok(create,'branch-aware create booking function must exist');
  assert.match(create,/business_id,branch_id,customer_id,service_id,worker_id/);
  assert.match(create,/p_business_id,v_conversation\.branch_id,v_conversation\.customer_id/);
  assert.match(create,/'branch_id',v_appt\.branch_id/);
  assert.match(create,/'currency_code',v_business\.currency_code/);
});

test('cancel reschedule and same-as-last stay inside the conversation branch',()=>{
  must(/a\.branch_id=v_conversation\.branch_id[\s\S]+a\.id=p_appointment_id[\s\S]+CUSTOMER_APPOINTMENT_NOT_FOUND_IN_BRANCH/);
  must(/where a\.business_id=p_business_id and a\.branch_id=v_branch_id[\s\S]+a\.customer_id=v_customer_id/);
  const occurrences=(migration.match(/CUSTOMER_APPOINTMENT_NOT_FOUND_IN_BRANCH/g)||[]).length;
  assert.equal(occurrences,2);
});

test('all new privileged branch scope functions remain service-role only',()=>{
  for(const fn of [
    'dabbir_whatsapp_ai_context',
    'dabbir_whatsapp_ai_check_availability',
    'dabbir_whatsapp_ai_create_booking',
    'dabbir_whatsapp_ai_cancel_booking',
    'dabbir_whatsapp_ai_reschedule_booking',
    'dabbir_whatsapp_ai_customer_recent_bookings',
  ]){
    assert.match(migration,new RegExp(`revoke all on function public\\.${fn}`));
    assert.match(migration,new RegExp(`grant execute on function public\\.${fn}[^;]+to service_role`));
  }
});
