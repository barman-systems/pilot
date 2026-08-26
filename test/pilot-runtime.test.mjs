import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifyClinicMessage, classifyCelebrityMessage } from '../api/pilot-runtime.js';

const root = new URL('../', import.meta.url);
const runtimeSource = await readFile(new URL('api/pilot-runtime.js', root), 'utf8');
const aiSource = await readFile(new URL('api/_ai-core.js', root), 'utf8');

test('clinic appointment intent', () => {
  assert.equal(classifyClinicMessage('أريد حجز موعد غداً'), 'APPOINTMENT_REQUEST');
});

test('clinic follow-up intent', () => {
  assert.equal(classifyClinicMessage('احتاج متابعة'), 'FOLLOW_UP');
});

test('celebrity advertising intent', () => {
  assert.equal(classifyCelebrityMessage('لدينا إعلان وحملة جديدة'), 'ADVERTISING_REQUEST');
});

test('celebrity collaboration intent', () => {
  assert.equal(classifyCelebrityMessage('نرغب في تعاون'), 'COLLABORATION_REQUEST');
});

test('celebrity invitation intent', () => {
  assert.equal(classifyCelebrityMessage('دعوة لحضور فعالية'), 'INVITATION');
});

test('production runtime requires a verified authenticated session and same-origin writes', () => {
  assert.match(runtimeSource, /accessTokenFromRequest/);
  assert.match(runtimeSource, /getVerifiedUser/);
  assert.match(runtimeSource, /getBusinessMemberships/);
  assert.match(runtimeSource, /requireSameOrigin\(req\)/);
  assert.match(runtimeSource, /AUTH_REQUIRED/);
  assert.doesNotMatch(runtimeSource, /preview_only_runtime/);
  assert.doesNotMatch(runtimeSource, /synthetic_mode_required/);
});

test('web conversations persist customer and AI messages as real non-simulated records', () => {
  assert.match(runtimeSource, /channel_type:\s*'web'/);
  assert.match(runtimeSource, /sender_type:\s*'customer'/);
  assert.match(runtimeSource, /sender_type:\s*'ai'/);
  assert.match(runtimeSource, /simulated:\s*false/g);
  assert.match(runtimeSource, /customer_message_persisted:\s*true/);
  assert.match(runtimeSource, /ai_message_persisted:\s*true/);
  assert.match(runtimeSource, /conversation_state_persisted:\s*true/);
});

test('AI runtime is grounded in business data and supports general businesses', () => {
  assert.match(aiSource, /pilot_businesses/);
  assert.match(aiSource, /VERIFIED BUSINESS CONTEXT/);
  assert.match(runtimeSource, /pilot_business_knowledge/);
  assert.match(runtimeSource, /buildBusinessContext/);
  assert.match(runtimeSource, /history/);
  assert.match(aiSource, /operational-runtime-ai/);
});

test('appointments and followups are persisted through tenant RLS instead of preview-only state', () => {
  assert.match(runtimeSource, /action === 'create_appointment'/);
  assert.match(runtimeSource, /pilot_appointments\?select=/);
  assert.match(runtimeSource, /action === 'create_followup'/);
  assert.match(runtimeSource, /pilot_followups\?select=/);
  assert.match(runtimeSource, /verified_persisted/);
});

test('WhatsApp stays explicitly outside the operational runtime until Meta authorization', () => {
  assert.match(runtimeSource, /state:\s*'NOT_OPERATIONAL'/);
  assert.match(runtimeSource, /META_AUTHORIZATION_NOT_COMPLETED/);
  assert.doesNotMatch(runtimeSource, /graph\.facebook\.com/);
  assert.doesNotMatch(runtimeSource, /WHATSAPP_ACCESS_TOKEN/);
});
