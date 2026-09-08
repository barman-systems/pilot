import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260908062500_dabbir_whatsapp_voice_booking_transcript_guard_v1.sql',import.meta.url),'utf8');

test('Arabic tenants reject Cloudflare English-only voice transcripts instead of trusting fabricated confidence',()=>{
  assert.match(sql,/cloudflare-workers-ai/);
  assert.match(sql,/lower\(coalesce\(v_business_locale,''\)\) like 'ar%'/);
  assert.match(sql,/v_language='en'/);
  assert.match(sql,/v_transcript !~ '\[\\u0600-\\u06FF\]'/);
  assert.match(sql,/v_uncertain:=true/);
});

test('booking voice guard accepts valid conversational turns such as greetings',()=>{
  assert.doesNotMatch(sql,/v_pending_action='service_selected'[^;]+v_transcript !~/i);
  assert.match(sql,/valid conversational turns/i);
  assert.match(sql,/booking_context/i);
  assert.match(sql,/if not v_uncertain then[\s\S]*dabbir_enqueue_message_batch/);
});
