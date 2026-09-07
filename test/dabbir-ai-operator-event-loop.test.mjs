import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260907190420_dabbir_ai_operator_event_loop_v1.sql',import.meta.url),'utf8');

const must=(needle,msg)=>assert.ok(sql.includes(needle),msg||`missing ${needle}`);

test('AI operator ledger is tenant-scoped, RLS protected and idempotent',()=>{
  must('create table if not exists public.dabbir_ai_operator_events');
  must('constraint dabbir_ai_operator_events_business_event_uq unique (business_id,event_key)');
  must('alter table public.dabbir_ai_operator_events enable row level security');
  must('using (dabbir_private.is_active_member(business_id))');
  must('on conflict(business_id,event_key) do update set');
});

test('planner-decision RPC is service-role only and validates confidence/risk/scope',()=>{
  must('create or replace function public.dabbir_record_ai_operator_decision_v1');
  must("if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'");
  must("raise exception 'AI_OPERATOR_CONFIDENCE_INVALID'");
  must("raise exception 'AI_OPERATOR_RISK_INVALID'");
  must("raise exception 'AI_OPERATOR_BATCH_SCOPE_INVALID'");
  must("'DECIDE','planner_decision','DECIDED'");
  must("'missing_fields'");
});

test('durable runtime artifacts feed understand/act/verify/handoff/outcome stages',()=>{
  must('create trigger dabbir_ai_operator_batch_event');
  must('create trigger dabbir_ai_operator_action_event');
  must('create trigger dabbir_ai_operator_outbound_event');
  must('create trigger dabbir_ai_operator_handoff_event');
  must('create trigger dabbir_ai_operator_appointment_event');
  for(const stage of ['UNDERSTAND','ACT','VERIFY','HANDOFF','OUTCOME']) must(`'${stage}'`);
});

test('Meta delivery verification is recorded without copying message bodies or recipient handles',()=>{
  must("new.provider_verified");
  must("'whatsapp_outbound'");
  must("'SEND_WHATSAPP'");
  assert.equal(/jsonb_build_object\([^)]*(?:body|recipient_handle)/is.test(sql),false,'operator metadata must not copy WhatsApp message body or recipient handle');
});

test('human handoff becomes a truthful conversation outcome and completion is not fabricated',()=>{
  must("'HUMAN_HANDOFF'");
  must("owner_attention_required=true");
  assert.equal(/BOOKING_COMPLETED[^\n]*insert into public\.dabbir_conversation_outcomes/i.test(sql),false,'booking completion must not be inferred from an internal appointment write');
});

test('operator conversation view uses invoker security',()=>{
  must('create or replace view public.dabbir_ai_operator_conversation_v1');
  must('with (security_invoker=true)');
  must("count(*) filter(where e.stage='VERIFY' and e.provider_verified)");
});
