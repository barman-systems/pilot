import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260908062000_dabbir_whatsapp_booking_voice_root_fix_v1.sql',import.meta.url),'utf8');

test('stale automated provider handoffs are released without touching active human ownership',()=>{
  assert.match(sql,/reason='AI provider chain unavailable; immediate continuity handoff'/);
  assert.match(sql,/state='QUEUED'/);
  assert.match(sql,/created_at<=now\(\)-interval '5 minutes'/);
  assert.match(sql,/state='RETURNED_TO_AI'/);
  assert.match(sql,/state in \('QUEUED','ASSIGNED','HUMAN_ACTIVE'\)/);
  assert.doesNotMatch(sql,/where h\.state='HUMAN_ACTIVE'[\s\S]{0,120}RETURNED_TO_AI/);
});

test('both fast dispatch and recovery claim paths repair stale provider handoffs before reading conversation state',()=>{
  const calls=sql.match(/perform public\.dabbir_whatsapp_ai_release_stale_provider_handoff\(v_batch\.business_id,v_batch\.conversation_id\);/g)||[];
  assert.equal(calls.length,2);
  assert.match(sql,/create or replace function public\.dabbir_whatsapp_ai_claim_dispatch/);
  assert.match(sql,/create or replace function public\.dabbir_whatsapp_ai_claim_next/);
});

test('conversation returns to AI only when no real active handoff remains',()=>{
  assert.match(sql,/set state='ai_active'/);
  assert.match(sql,/not exists\([\s\S]*state in \('QUEUED','ASSIGNED','HUMAN_ACTIVE'\)/);
  assert.match(sql,/c\.state='action_required'/);
});
