import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

const resilience=await read('supabase/migrations/20260903120500_dabbir_worst_case_booking_resilience_v1.sql');
const calendarLock=await read('supabase/migrations/20260902073500_dabbir_booking_calendar_transaction_lock_v1.sql');
const salonApi=await read('api/salon-operations.js');
const whatsapp=await read('api/_whatsapp-live-core.js');
const guardian=await read('.github/workflows/dabbir-release-guardian.yml');

test('worst-case gate: booking writes are serialized and replay-safe',()=>{
  assert.match(calendarLock,/pg_advisory_xact_lock\(hashtextextended\('dabbir:booking-calendar:'/);
  assert.match(resilience,/dabbir_appointments_business_idempotency_uq/);
  assert.match(resilience,/dabbir_salon_quick_book_idempotent/);
  assert.match(resilience,/pg_advisory_xact_lock\(hashtextextended\('dabbir:booking-calendar:'/);
  assert.match(resilience,/IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_BOOKING/);
  assert.match(resilience,/'idempotent_replay',true/);
  assert.match(resilience,/'idempotent_replay',false/);
});

test('worst-case gate: quick-book API can use a stable request id without breaking legacy callers',()=>{
  assert.match(salonApi,/const IDEMPOTENCY_RE=/);
  assert.match(salonApi,/body\.idempotency_key\|\|body\.request_id/);
  assert.match(salonApi,/dabbir_salon_quick_book_idempotent/);
  assert.match(salonApi,/p_idempotency_key:idempotencyKey/);
  assert.match(salonApi,/idempotent_replay\?200:201/);
  assert.match(salonApi,/:await rpc\(ctx\.token,'dabbir_salon_quick_book',common/);
});

test('worst-case gate: definite notification failures have bounded durable retry',()=>{
  for(const marker of ['attempt_count','max_attempts','next_attempt_at','processing_started_at','dead_lettered_at'])assert.match(resilience,new RegExp(marker));
  assert.match(resilience,/attempt_count=n\.attempt_count\+1/);
  assert.match(resilience,/for update skip locked/);
  assert.match(resilience,/when v_row\.attempt_count<=1 then interval '5 minutes'/);
  assert.match(resilience,/when v_row\.attempt_count=2 then interval '15 minutes'/);
  assert.match(resilience,/when v_row\.attempt_count=3 then interval '1 hour'/);
  assert.match(resilience,/else interval '6 hours'/);
  assert.match(resilience,/v_row\.attempt_count<v_row\.max_attempts[\s\S]*status='pending'/);
  assert.match(resilience,/dead_lettered_at=now\(\)/);
});

test('worst-case gate: ambiguous WhatsApp outcomes never auto-retry',()=>{
  assert.match(whatsapp,/META_WHATSAPP_TEMPLATE_TIMEOUT_AMBIGUOUS/);
  assert.match(whatsapp,/error\.ambiguous = response\.status >= 500/);
  assert.match(resilience,/STALE_PROCESSING_REQUIRES_RECONCILIATION/);
  assert.match(resilience,/p_status='ambiguous'[\s\S]*status='ambiguous'[\s\S]*next_attempt_at=null/);
  assert.doesNotMatch(resilience,/p_status='ambiguous'[\s\S]{0,500}status='pending'/);
});

test('worst-case gate: stale and expired customer messages fail closed',()=>{
  assert.match(resilience,/coalesce\(n\.processing_started_at,n\.updated_at\)<now\(\)-interval '15 minutes'/);
  assert.match(resilience,/NOTIFICATION_EXPIRED_BEFORE_DELIVERY/);
  assert.match(resilience,/notification_type in \('booking_confirmation','reminder_24h','reminder_2h','appointment_changed'\)/);
  assert.match(resilience,/a\.starts_at<=now\(\)/);
});

test('worst-case gate: failed main releases still have automatic rollback protection',()=>{
  assert.match(guardian,/DABBIR CI/);
  assert.match(guardian,/DABBIR Protected Live Smoke/);
  assert.match(guardian,/DABBIR AI Full Customer Journey/);
  assert.match(guardian,/git revert/);
  assert.match(guardian,/Fail-closed rollback pushed/);
});
