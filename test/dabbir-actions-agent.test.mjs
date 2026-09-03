import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const core = fs.readFileSync(new URL('../api/_dabbir-action-core.js', import.meta.url), 'utf8');
const webhook = fs.readFileSync(new URL('../api/dabbir-whatsapp-webhook.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260903200500_dabbir_actions_whatsapp_agent_v1.sql', import.meta.url), 'utf8');
const idempotency = fs.readFileSync(new URL('../supabase/migrations/20260903201000_dabbir_actions_idempotency_v1.sql', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

test('WhatsApp webhook persists first and defers AI work with waitUntil', () => {
  assert.match(webhook, /persistSignedInbound\(event\)/);
  assert.match(webhook, /enqueueWhatsAppAiAction/);
  assert.match(webhook, /waitUntil\(processWhatsAppAgentJobs/);
  assert.match(webhook, /delayMs:\s*2200/);
});

test('action queue is tenant scoped, debounced and generation guarded', () => {
  assert.match(migration, /unique \(business_id, conversation_id\)/i);
  assert.match(migration, /now\(\)\+interval '2 seconds'/i);
  assert.match(migration, /processing_generation/i);
  assert.match(migration, /dabbir_ai_job_generation_current/i);
  assert.match(core, /generationCurrent\(job\)/);
});

test('AI booking is idempotent and confirms only verified DB outcomes', () => {
  assert.match(idempotency, /dabbir_action_idempotency/i);
  assert.match(idempotency, /dabbir_action_create_booking_idempotent/i);
  assert.match(core, /result\?\.verified/);
  assert.match(core, /BOOKING_ACTION_UNVERIFIED/);
  assert.match(core, /SLOT_BECAME_UNAVAILABLE/);
});

test('human handoff blocks AI as soon as the handoff is queued', () => {
  assert.match(migration, /h\.state in \('QUEUED','ASSIGNED','HUMAN_ACTIVE'\)/i);
  assert.match(core, /HUMAN_REQUEST/);
  assert.match(core, /dabbir_action_create_handoff/);
});

test('WhatsApp and web bookings do not require owner approval or deposit gate', () => {
  assert.match(migration, /new\.confirmation_gate := 'none'/i);
  assert.match(migration, /new\.owner_approval_status := 'not_required'/i);
  assert.match(migration, /new\.status := 'confirmed'/i);
});

test('ambiguous outbound delivery fails closed to human review', () => {
  assert.match(core, /WHATSAPP_OUTBOUND_FINALIZE_UNCERTAIN/);
  assert.match(core, /AMBIGUOUS_OUTBOUND/);
  assert.match(core, /p_route_class: 'SUPPORT'/);
});

test('Vercel has both immediate webhook execution budget and durable recovery cron', () => {
  assert.equal(vercel.functions?.['api/dabbir-whatsapp-webhook.js']?.maxDuration, 60);
  assert.equal(vercel.functions?.['api/dabbir-actions-cron.js']?.maxDuration, 60);
  assert.ok(vercel.crons?.some(item => item.path === '/api/dabbir-actions-cron' && item.schedule === '*/5 * * * *'));
});
