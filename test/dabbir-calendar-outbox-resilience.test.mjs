import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

const migration=await read('supabase/migrations/20260903131500_dabbir_calendar_outbox_resilience_v1.sql');
const calendar=await read('api/_calendar-sync-core.js');
const worker=await read('api/calendar-outbox-cron.js');
const appointmentApi=await read('api/appointment-management.js');
const vercel=JSON.parse(await read('vercel.json'));

test('calendar mutations commit to a durable transactional outbox',()=>{
  assert.match(migration,/create table if not exists public\.dabbir_integration_outbox/);
  assert.match(migration,/after insert or update on public\.dabbir_appointments/);
  assert.match(migration,/enqueue_calendar_sync_from_appointment/);
  assert.match(migration,/appointment\.cancelled/);
  assert.match(migration,/appointment\.upserted/);
  assert.match(migration,/unique \(business_id,destination,idempotency_key\)/);
});

test('calendar outbox uses leases, bounded retries and dead-letter state',()=>{
  assert.match(migration,/for update skip locked/);
  assert.match(migration,/lock_token=gen_random_uuid\(\)/);
  assert.match(migration,/status=case when o\.attempts>=o\.max_attempts then 'dead' else 'retry' end/);
  assert.match(migration,/least\(1800,30\*power\(2/);
  assert.match(migration,/where o\.id=p_job_id and o\.status='processing' and o\.lock_token=p_lock_token/);
  assert.match(migration,/grant execute on function public\.dabbir_claim_integration_jobs\(integer\) to service_role/);
});

test('calendar provider writes are safe to repeat after timeouts',()=>{
  assert.match(calendar,/function googleEventId\(appointmentId\)/);
  assert.match(calendar,/id:googleEventId\(appointmentId\)/);
  assert.match(calendar,/transactionId:appointment\.id\.replace/);
  assert.match(calendar,/provider==='google'&&Number\(error\?\.providerStatus\|\|error\?\.code\)===409/);
  assert.match(calendar,/retryableProviderStatus/);
  assert.match(calendar,/status=in\.\(active,error\)/);
  assert.match(calendar,/appointment\.ends_at/);
});

test('appointment truth no longer waits for Google or Outlook',()=>{
  assert.doesNotMatch(appointmentApi,/syncBusinessCalendars/);
  assert.match(appointmentApi,/mode:'durable_outbox'/);
  assert.match(appointmentApi,/business_truth_committed_first:true/);
  assert.match(appointmentApi,/external_sync_async:true/);
});

test('appointment delete preserves operational history as cancellation',()=>{
  assert.match(migration,/revoke delete on public\.dabbir_appointments from authenticated/);
  assert.doesNotMatch(appointmentApi,/method:'DELETE'/);
  assert.match(appointmentApi,/state:'VERIFIED_CANCELLED'/);
  assert.match(appointmentApi,/retained_history:true/);
  assert.match(appointmentApi,/hard_deleted:false/);
});

test('rescheduling preserves appointment duration',()=>{
  assert.match(appointmentApi,/function durationMs\(appointment\)/);
  assert.match(appointmentApi,/patch\.ends_at=new Date\(start\.getTime\(\)\+durationMs\(current\)\)/);
});

test('calendar outbox worker is authenticated and scheduled within five minutes',()=>{
  assert.match(worker,/CRON_AUTH_REQUIRED/);
  assert.match(worker,/dabbir_claim_integration_jobs/);
  assert.match(worker,/dabbir_finalize_integration_job/);
  assert.match(worker,/syncBusinessCalendars/);
  assert.match(worker,/retryable/);
  const cron=(vercel.crons||[]).find(item=>item.path==='/api/calendar-outbox-cron');
  assert.deepEqual(cron,{path:'/api/calendar-outbox-cron',schedule:'*/5 * * * *'});
  assert.equal(vercel.functions?.['api/calendar-outbox-cron.js']?.maxDuration,60);
});
