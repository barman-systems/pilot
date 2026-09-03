import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>readFileSync(path.join(root,file),'utf8');
const base=read('supabase/migrations/20260903200000_dabbir_worst_case_resilience_v1.sql');
const recovery=read('supabase/migrations/20260903200500_dabbir_resilience_recovery_health_v1.sql');
const duplicate=read('supabase/migrations/20260903201000_dabbir_active_booking_duplicate_guard_v1.sql');
const calendar=read('api/_calendar-sync-core.js');
const reminder=read('api/salon-reminders-cron.js');
const worker=read('api/resilience-worker-cron.js');
const health=read('api/runtime-health.js');
const limiter=read('api/_rate-limit.js');
const publicBooking=read('api/public-car-wash.js');
const guardian=read('.github/workflows/dabbir-runtime-guardian.yml');
const releaseGuardian=read('.github/workflows/dabbir-release-guardian.yml');
const vercel=JSON.parse(read('vercel.json'));
const salonBase=read('supabase/migrations/20260831090000_dabbir_salon_mode_p0.sql');
const whatsapp=read('api/dabbir-whatsapp-webhook.js');
const stripe=read('supabase/functions/barman-stripe-checkout/index.ts');

const has=(source,...markers)=>{for(const marker of markers)assert.ok(source.includes(marker),`missing ${marker}`)};

test('booking truth is idempotent and active duplicates fail closed',()=>{
  has(base,'idempotency_key text','dabbir_appointments_business_idempotency_uq','dabbir_create_appointment_idempotent','IDEMPOTENCY_KEY_REUSE_CONFLICT');
  has(duplicate,'dabbir_appointments_active_customer_slot_uq',"status not in ('cancelled','completed','no_show')");
  has(salonBase,'pg_advisory_xact_lock','prevent_appointment_calendar_conflict','APPOINTMENT_CONFLICT');
});

test('appointments are cancelled, never hard deleted by normal authenticated users',()=>{
  has(base,'drop policy if exists dabbir_appointments_delete','revoke delete on public.dabbir_appointments from authenticated');
});

test('calendar side effects use a durable outbox with retry and dead letter semantics',()=>{
  has(base,'dabbir_integration_outbox',"'pending','processing','retry','succeeded','dead','cancelled'",'for update skip locked','dabbir_finalize_integration_job','max_attempts','available_at');
  has(base,'zz_dabbir_appointment_calendar_outbox','appointment.cancelled','appointment.upserted');
  has(worker,'dabbir_claim_integration_jobs','syncBusinessCalendars','dabbir_finalize_integration_job');
});

test('calendar provider creation is idempotent under ambiguous responses',()=>{
  has(calendar,'function googleEventId','id:googleEventId(appointmentId)','providerStatus','retryableProviderStatus');
  assert.match(calendar,/provider==='google'.*409/s);
  has(calendar,'transactionId:appointment.id.replace');
});

test('WhatsApp reminders retry confirmed failures but never blindly retry ambiguous sends',()=>{
  has(base,'attempts integer not null default 0','max_attempts integer not null default 6','next_attempt_at','dabbir_finalize_workflow_notification_v2');
  has(base,"elsif p_status='ambiguous' then","status='ambiguous'","v_state:='pending'");
  has(reminder,'error?.ambiguous===true)return false','p_retryable:retryable','WHATSAPP_TENANT_NOT_LINKED');
});

test('public booking abuse is bounded by a database backed fail-closed limiter',()=>{
  has(base,'dabbir_rate_limit_windows','dabbir_consume_rate_limit');
  has(limiter,'crypto.createHash','RATE_LIMIT_UNAVAILABLE','failClosed=true');
  has(publicBooking,"action:'public_car_wash_booking'",'BOOKING_RATE_LIMITED');
});

test('runtime health treats booking and recovery integrity as core gates',()=>{
  has(recovery,'recovery_health_check','v_core:=v_conflict_guard and v_recovery_guard');
  has(health,'dabbir_resilience_health_snapshot','core_ok','RUNTIME_HEALTH_UNAVAILABLE');
});

test('recovery snapshots and dry-run verification are exercised hourly',()=>{
  has(worker,"getUTCMinutes()===0",'dabbir_owner_recovery_maintenance_v1','RECOVERY_DRY_RUN_FAILED');
});

test('runtime worker executes every minute while reminders remain five minute cadence',()=>{
  const resilience=vercel.crons.find(item=>item.path==='/api/resilience-worker-cron');
  const reminders=vercel.crons.find(item=>item.path==='/api/salon-reminders-cron');
  assert.equal(resilience?.schedule,'* * * * *');
  assert.equal(reminders?.schedule,'*/5 * * * *');
  assert.equal(vercel.functions['api/resilience-worker-cron.js']?.maxDuration,60);
});

test('external guardian detects production failure without unsafe provider-outage rollback',()=>{
  has(guardian,'*/5 * * * *','/api/runtime-health','for attempt in 1 2 3','gh issue create','gh issue close');
  assert.ok(!releaseGuardian.includes('DABBIR Runtime Guardian'),'runtime provider health must not trigger blind code rollback');
  has(releaseGuardian,'revert-failed-main','git revert','FAILED_SHA');
});

test('WhatsApp inbound remains unacknowledged if real persistence fails',()=>{
  has(whatsapp,'persistSignedInbound','SIGNED_EVENT_PERSISTENCE_FAILED');
});

test('payment creation remains provider-idempotent',()=>{
  has(stripe,"headers['Idempotency-Key']=idempotencyKey",'dabbir_checkout_');
});

test('service-only resilience tables are not writable by customer roles',()=>{
  has(base,'revoke all on public.dabbir_integration_outbox from public,anon,authenticated','revoke all on public.dabbir_rate_limit_windows from public,anon,authenticated');
  has(base,'grant execute on function public.dabbir_claim_integration_jobs(integer) to service_role','grant execute on function public.dabbir_consume_rate_limit(text,text,integer,integer) to service_role');
});
