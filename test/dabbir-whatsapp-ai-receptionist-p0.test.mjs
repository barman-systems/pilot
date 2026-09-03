import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const queue=fs.readFileSync(path.join(root,'supabase/migrations/20260903104500_dabbir_whatsapp_ai_queue_v1.sql'),'utf8');
const outbound=fs.readFileSync(path.join(root,'supabase/migrations/20260903104700_dabbir_whatsapp_ai_outbound_v1.sql'),'utf8');
const actions=fs.readFileSync(path.join(root,'supabase/migrations/20260903105000_dabbir_whatsapp_ai_actions_v1.sql'),'utf8');
const patch=fs.readFileSync(path.join(root,'supabase/migrations/20260903105100_dabbir_whatsapp_ai_actions_patch_v1.sql'),'utf8');
const core=fs.readFileSync(path.join(root,'api/_dabbir-whatsapp-ai-core.js'),'utf8');
const worker=fs.readFileSync(path.join(root,'api/dabbir-whatsapp-ai-worker.js'),'utf8');
const cron=fs.readFileSync(path.join(root,'api/dabbir-whatsapp-ai-cron.js'),'utf8');
const vercel=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));

const must=(src,re,msg)=>assert.match(src,re,msg);

test('signed inbound persistence durably enqueues before returning and duplicate webhook exits before enqueue',()=>{
  must(queue,/dabbir_whatsapp_persist_inbound/);
  must(queue,/if found then[\s\S]+return query[\s\S]+return;[\s\S]+dabbir_enqueue_message_batch/);
  must(queue,/dabbir_enqueue_message_batch[\s\S]+dispatch_token[\s\S]+net\.http_post/);
  must(queue,/FAST_DISPATCH_ENQUEUE_FAILED/);
});

test('AI queue uses lease tokens, bounded retries, stale turn detection and human takeover stop',()=>{
  for(const token of ['dabbir_whatsapp_ai_claim_dispatch','dabbir_whatsapp_ai_claim_next','lock_token','locked_until','attempt_count','max_attempts','HUMAN_REQUIRED','newer_customer_message_exists','SUPERSEDED_BY_NEW_CUSTOMER_MESSAGE'])must(queue,new RegExp(token));
  must(core,/newer_customer_message_exists===true[\s\S]+CANCELLED/);
  must(core,/state==='human_active'\|\|context\?\.conversation\?\.state==='action_required'/);
});

test('AI outbound identity is truthful and service-role only',()=>{
  must(outbound,/sender_type text not null default 'human'/);
  must(outbound,/sender_type='ai'/);
  must(outbound,/dabbir_whatsapp_ai_reserve_outbound/);
  must(outbound,/SERVICE_ROLE_REQUIRED/);
  must(outbound,/AI_REPLY/);
});

test('AI booking inserts whatsapp source and never overrides confirmation or deposit snapshot',()=>{
  const insert=actions.match(/insert into public\.dabbir_appointments\([\s\S]*?\) values\([\s\S]*?\) returning \* into v_appt;/)?.[0]||'';
  assert.ok(insert,'AI appointment insert must exist');
  must(insert,/booking_source/);must(insert,/'whatsapp'/);must(insert,/'unpaid'/);
  assert.doesNotMatch(insert,/confirmation_gate|deposit_required_amount|deposit_currency_code|owner_approval_status/);
  must(core,/confirmation_gate==='deposit'/);
  must(core,/needs? عربون|يحتاج عربون/);
  must(core,/Your booking is confirmed/);
});

test('LLM cannot supply arbitrary UUIDs to final booking; selected verified pending slot is authoritative',()=>{
  must(core,/slots=pendingSlots\(context\),slot=slots\[index\]/);
  must(core,/p_service_id:slot\.service_id/);
  must(core,/p_worker_id:safeUuid\(slot\.worker_id\)/);
  must(core,/p_starts_at:slot\.starts_at/);
  assert.doesNotMatch(core,/decision\.serviceId|decision\.workerId|decision\.appointmentId/);
  must(core,/service_name and worker_name must exactly match a name in VERIFIED CONTEXT/);
});

test('availability and booking confirmation use verified business timezone without Dubai fallback',()=>{
  must(actions,/select b\.timezone into v_timezone/);
  assert.doesNotMatch(actions,/Asia\/Dubai/);
  must(patch,/v_business\.timezone/);
  must(core,/BOOKING_TIMEZONE_UNVERIFIED/);
  assert.doesNotMatch(core,/result\?\.timezone\s*\|\|\s*['"]Asia\/Dubai['"]/);
});

test('availability migration never mixes a rowtype target with scalar INTO targets',()=>{
  must(patch,/select w\.\* into v_worker[\s\S]+select coalesce\(ws\.duration_minutes,v_service_duration\),coalesce\(ws\.price_aed,v_base_price\) into v_candidate_duration,v_candidate_price/);
  assert.doesNotMatch(patch,/select w\.\*,coalesce\(ws\.duration_minutes[\s\S]{0,500}into v_worker,v_candidate_duration,v_candidate_price/);
});

test('cancel and reschedule are scoped to the conversation customer and stop after handoff',()=>{
  for(const src of [actions,patch]){
    must(src,/a\.customer_id=v_conversation\.customer_id/);
  }
  must(patch,/state in \('human_active','action_required'\)/);
  must(patch,/AI_BLOCKED_BY_HUMAN_TAKEOVER/);
  must(actions,/PAST_APPOINTMENT_NOT_CANCELLABLE_BY_AI/);
  must(patch,/APPOINTMENT_NOT_RESCHEDULABLE_BY_AI/);
});

test('same-as-last-time is grounded from customer booking history',()=>{
  must(actions,/dabbir_whatsapp_ai_customer_recent_bookings/);
  must(actions,/a\.customer_id=v_customer_id/);
  must(core,/reuse_last/);
  must(core,/recentBookings\(context\)/);
});

test('ambiguous Meta outcome never blind-retries and is handed to a human',()=>{
  const ambiguous=core.match(/if\(error\?\.ambiguous===true\)\{([\s\S]*?)\n  \}\n  if\(Number\(error\?\.providerStatus\)===429\)/)?.[1]||'';
  assert.ok(ambiguous,'ambiguous-outbound branch must exist before retry classification');
  must(ambiguous,/Ambiguous WhatsApp delivery requires human review/);
  must(ambiguous,/finish\(claim,'HUMAN_REQUIRED'/);
  assert.doesNotMatch(ambiguous,/finish\(claim,'RETRY'/);
});

test('worker requires a UUID capability token and does not expose execution state',()=>{
  must(worker,/UUID\.test\(token\)/);
  must(worker,/return json\(res,202,\{ok:true,accepted:false\}\)/);
  must(worker,/return json\(res,202,\{ok:true,accepted:true\}\)/);
  assert.doesNotMatch(worker,/lock_token|batch_id|service_role/i);
});

test('recovery cron is protected and scheduled every five minutes',()=>{
  must(cron,/cronAuthMode\(req\)/);must(cron,/CRON_AUTH_REQUIRED/);
  const recoveryCron=(vercel.crons||[]).find(item=>item?.path==='/api/dabbir-whatsapp-ai-cron');
  assert.deepEqual(recoveryCron,{path:'/api/dabbir-whatsapp-ai-cron',schedule:'*/5 * * * *'});
  assert.equal(vercel.functions?.['api/dabbir-whatsapp-ai-worker.js']?.maxDuration,60);
});

test('operation ledger makes create cancel and reschedule replay safe',()=>{
  for(const type of ['booking.create','booking.cancel','booking.reschedule'])must(actions,new RegExp(type.replace('.','\\.')));
  must(actions,/AI_OPERATION_KEY_REUSED_DIFFERENT_REQUEST/);
  must(actions,/pg_advisory_xact_lock/);
});