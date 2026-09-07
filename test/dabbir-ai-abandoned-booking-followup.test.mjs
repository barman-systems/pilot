import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260907193413_dabbir_ai_abandoned_booking_followup_v1.sql',import.meta.url),'utf8');
const cron=fs.readFileSync(new URL('../api/dabbir-whatsapp-ai-cron.js',import.meta.url),'utf8');
const must=(source,needle,msg)=>assert.ok(source.includes(needle),msg||`missing ${needle}`);

test('abandoned booking recovery is internal-only and service-role gated',()=>{
  must(sql,"if coalesce(auth.role(),'')<>'service_role'");
  must(sql,"p.action_key='followup.capture_internal'");
  must(sql,"p.risk_class='LOW'");
  must(sql,"coalesce((p.metadata->>'external_side_effects')::boolean,false)=false");
  must(sql,"'external_side_effects',false");
  must(sql,"'automatic_external_send',false");
  must(sql,"recommended_message,policy_state,consent_state,channel_policy_state,quiet_hours_state");
  must(sql,"null,'NOT_CHECKED','UNKNOWN','UNKNOWN','UNKNOWN'");
  assert.equal(/sendMetaText|graph\.facebook\.com|dabbir_mark_followup_sent/i.test(sql),false,'capture migration must never send externally');
});

test('candidate is created only after a quiet abandoned booking window',()=>{
  must(sql,"e.stage='QUALIFIED'");
  must(sql,"e.occurred_at<=now()-interval '15 minutes'");
  must(sql,"later.stage in ('BOOKED','CONFIRMED','RESCHEDULED','ARRIVED','IN_SERVICE','COMPLETED','PAYMENT_RECORDED','CANCELLED','NO_SHOW','REFUNDED')");
  must(sql,"m.sender_type='customer'");
  must(sql,"m.created_at>q.qualified_at");
  must(sql,"h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')");
});

test('candidate creation is idempotent and bounded',()=>{
  must(sql,'create unique index if not exists dabbir_followups_ai_abandoned_qualified_uq');
  must(sql,"((metadata->>'source_qualified_event_id'))");
  must(sql,'greatest(1,least(coalesce(p_limit,25),100))');
  must(sql,'on conflict do nothing');
});

test('WhatsApp recovery cron captures internal candidates without risking core recovery',()=>{
  must(cron,"serviceRpc('dabbir_capture_abandoned_booking_followups_v1',{p_limit:25})");
  must(cron,"followup_capture_ok:followupCaptureError===null");
  must(cron,"console.error('dabbir_whatsapp_ai_followup_capture_failed'");
  assert.match(cron,/try\{\s*const captured=await serviceRpc\('dabbir_capture_abandoned_booking_followups_v1'/);
  assert.match(cron,/\}catch\(error\)\{\s*followupCaptureError=/);
});
