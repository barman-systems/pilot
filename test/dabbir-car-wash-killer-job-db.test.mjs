import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260904123000_dabbir_car_wash_killer_job_p0.sql', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../api/car-wash-admin.js', import.meta.url), 'utf8');
const ownerUi = fs.readFileSync(new URL('../api/car-wash-operations-ui.js', import.meta.url), 'utf8');

test('migration defines one central legal state transition authority', () => {
  assert.match(migration, /create or replace function public\.dabbir_car_wash_transition_job/i);
  assert.match(migration, /dabbir_private\.car_wash_transition_allowed\(v_job\.state,v_to\)/i);
  for (const state of ['inquiry','qualified','offered','confirmed','assigned','reminded','completed','paid','lost']) assert.match(migration, new RegExp(`'${state}'`));
  assert.match(migration, /ILLEGAL_CAR_WASH_TRANSITION/);
  assert.match(migration, /OWNER_OVERRIDE_REASON_REQUIRED/);
  assert.match(migration, /unique \(business_id,idempotency_key\)/i);
  assert.match(migration, /CAR_WASH_IDEMPOTENCY_CONFLICT/);
});

test('capacity is serialized at business scope and includes team and travel buffers', () => {
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('dabbir:car-wash-capacity:'\|\|new\.business_id::text,0\)\)/i);
  assert.match(migration, /CAR_WASH_CREW_DOUBLE_BOOKED/);
  assert.match(migration, /CAR_WASH_CAPACITY_FULL/);
  assert.match(migration, /default_travel_minutes/);
  assert.match(migration, /assigned_worker_id/);
  assert.match(migration, /max_concurrent_bookings between 1 and 15/i);
});

test('new tenant data is forced-RLS and users receive read-only table grants', () => {
  for (const table of ['dabbir_car_wash_jobs','dabbir_car_wash_job_transitions','dabbir_car_wash_outcome_ledger']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`, 'i'));
  }
  assert.match(migration, /revoke all on public\.dabbir_car_wash_jobs, public\.dabbir_car_wash_job_transitions, public\.dabbir_car_wash_outcome_ledger from public,anon,authenticated/i);
  assert.match(migration, /dabbir_private\.has_permission\(business_id,'view_business'\)/i);
  assert.match(migration, /dabbir_private\.has_permission\(business_id,'view_analytics'\)/i);
  assert.match(migration, /coalesce\(auth\.role\(\),''\)<>'service_role' and not dabbir_private\.has_permission\(p_business_id,'manage_appointments'\)/i);
  assert.match(migration, /CAR_WASH_SYSTEM_ACTOR_FORBIDDEN/);
});

test('outcome ledger separates estimated, verified, recovered and lost attribution', () => {
  for (const column of ['estimated_revenue','verified_revenue','recovered_revenue','lost_revenue','attribution_source','evidence_reference']) assert.match(migration, new RegExp(column));
  assert.match(migration, /payment_event_verified/);
  assert.match(migration, /VERIFIED_PAYMENT_EVIDENCE_REQUIRED/);
  assert.match(migration, /recovered_after_followup/);
  assert.match(migration, /booking_value_not_payment/);
  assert.match(migration, /with \(security_invoker=true\)/i);
});

test('shadow, granular permissions, confidence, kill switch and AI hard cap fail closed', () => {
  for (const permission of ['READ','MESSAGE','QUOTE','BOOK','ASSIGN','REMIND','CHARGE']) assert.match(migration, new RegExp(`'${permission}'`));
  assert.match(migration, /SHADOW_MODE_NO_EXTERNAL_ACTION/);
  assert.match(migration, /CAR_WASH_KILL_SWITCH_ACTIVE/);
  assert.match(migration, /LOW_CONFIDENCE_HUMAN_ESCALATION/);
  assert.match(migration, /ai_target_monthly_aed between 0 and 30/i);
  assert.match(migration, /ai_hard_cap_monthly_aed between 1 and 60/i);
});

test('owner status updates no longer patch state directly', () => {
  const block = admin.slice(admin.indexOf("if(action==='update_booking_status')"), admin.indexOf("if(action==='add_photo')"));
  assert.match(block, /rpc\/dabbir_car_wash_transition_job/);
  assert.doesNotMatch(block, /method:'PATCH'/);
  assert.match(block, /CAR_WASH_JOB_NOT_FOUND/);
  assert.match(block, /payment_evidence/);
});

test('owner action screen prioritizes stalled work, proof and emergency controls', () => {
  for (const marker of ['طلبات WhatsApp والحجوزات','متوقفة الآن','إيراد مثبت','سجل التنفيذ والأدلة','إيقاف فوري','save_operator_policy']) assert.match(ownerUi, new RegExp(marker));
  assert.match(ownerUi, /Estimated/);
  assert.match(ownerUi, /Verified/);
  assert.match(ownerUi, /Recovered/);
  assert.match(ownerUi, /Lost/);
  assert.match(ownerUi, /\['MESSAGE','QUOTE','BOOK','ASSIGN','REMIND','CHARGE'\]/);
  assert.match(ownerUi, /permission_'\+key/);
  assert.match(ownerUi, /provider_verified/);
});

test('real booking creation carries branch, atomic capacity and mandatory appointment currency', () => {
  assert.match(migration, /add column if not exists branch_id uuid references public\.dabbir_business_branches/i);
  assert.match(migration, /insert into public\.dabbir_appointments\(business_id,branch_id/i);
  assert.match(migration, /deposit_currency_code/);
  assert.match(migration, /for update of j skip locked/i);
});

test('reminder delivery is leased, idempotent, provider-verified and escalates ambiguous sends', () => {
  for (const marker of ['dabbir_claim_car_wash_reminders','dabbir_finish_car_wash_reminder','dabbir_reconcile_car_wash_message_status','dabbir_car_wash_record_external_message']) assert.match(migration, new RegExp(marker));
  assert.match(migration, /reminder_attempt_count<3/);
  assert.match(migration, /then 'ambiguous' else 'failed'/);
  assert.match(migration, /provider_verified/);
  assert.match(migration, /Car-wash reminder delivery needs human review/);
});

test('production migration is explicitly gated in the artifact', () => {
  assert.match(migration, /PRODUCTION GATE/);
  assert.match(migration, /must not be applied/i);
});
