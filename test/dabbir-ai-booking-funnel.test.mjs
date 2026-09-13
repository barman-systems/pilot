import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const base=fs.readFileSync(new URL('../supabase/migrations/20260907192229_dabbir_ai_booking_funnel_v1.sql',import.meta.url),'utf8');
const guard=fs.readFileSync(new URL('../supabase/migrations/20260907192258_dabbir_ai_booking_funnel_trigger_guard_v1.sql',import.meta.url),'utf8');
const final=`${base}\n${guard}`;
const must=(needle,msg)=>assert.ok(final.includes(needle),msg||`missing ${needle}`);

test('booking funnel is tenant scoped, RLS protected, idempotent and evidence-classified',()=>{
  must('create table if not exists public.dabbir_ai_booking_funnel_events');
  must('constraint dabbir_ai_booking_funnel_business_event_uq unique (business_id,event_key)');
  must('alter table public.dabbir_ai_booking_funnel_events enable row level security');
  must('using (dabbir_private.is_active_member(business_id))');
  must("verification_class in ('AI_DECISION','DATABASE_COMMIT','PROVIDER_CALLBACK','HUMAN_CONFIRMED')");
  must('on conflict(business_id,event_key) do update set');
});

test('funnel never labels AI decisions as completed or paid',()=>{
  must("new.stage<>'DECIDE' or new.action not in ('CHECK_AVAILABILITY','CREATE_BOOKING')");
  must("'QUALIFIED'");
  must("'AI_DECISION'");
  assert.equal(/AI_DECISION[^\n]{0,180}'COMPLETED'/i.test(final),false);
  assert.equal(/AI_DECISION[^\n]{0,180}'PAYMENT_RECORDED'/i.test(final),false);
});

test('booking, appointment and payment evidence are sourced from durable commits',()=>{
  must("new.operation_type not in ('booking.create','booking.cancel','booking.reschedule')");
  must("'DATABASE_COMMIT'");
  must("when 'completed' then 'COMPLETED'");
  must("new.status not in ('paid','refunded')");
  must("'PAYMENT_RECORDED'");
  must("'REFUNDED'");
});

test('appointment lifecycle trigger only runs on UPDATE where OLD is defined',()=>{
  must('after update of status,payment_status on public.dabbir_appointments');
  assert.equal(/create trigger dabbir_ai_booking_funnel_appointment_event\s+after insert or update/i.test(guard),false);
  must('old.status is distinct from new.status');
  must('old.payment_status is distinct from new.payment_status');
});

test('funnel summary distinguishes internal completion/payment records from external proof',()=>{
  must('create or replace view public.dabbir_ai_booking_funnel_current_v1');
  must('with (security_invoker=true)');
  must("bool_or(e.stage='COMPLETED') as completed_in_system");
  must("bool_or(e.stage='PAYMENT_RECORDED') as payment_recorded");
  assert.equal(/dabbir_finalize_conversation_outcome/i.test(final),false,'funnel must not fabricate externally verified conversation outcomes');
  assert.equal(/verified_external_result\s*=\s*true/i.test(final),false,'funnel must not claim external verification');
});

test('capture function rejects cross-conversation customer or appointment attribution',()=>{
  must('if p_customer_id is not null and v_customer is distinct from p_customer_id then return null; end if;');
  must('if p_appointment_id is not null and not exists(');
  must('where a.business_id=p_business_id and a.id=p_appointment_id');
});
