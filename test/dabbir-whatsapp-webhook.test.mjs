import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  verifyWebhookChallenge,
  verifyMetaSignature,
  extractWhatsAppEvents,
  classifyDABBIREvent
} from '../api/dabbir-whatsapp-webhook.js';

test('verifies webhook challenge', () => {
  const result = verifyWebhookChallenge({
    'hub.mode': 'subscribe',
    'hub.verify_token': 'secret',
    'hub.challenge': '12345'
  }, 'secret');
  assert.deepEqual(result, { ok: true, challenge: '12345' });
});

test('rejects bad webhook token', () => {
  const result = verifyWebhookChallenge({
    'hub.mode': 'subscribe',
    'hub.verify_token': 'bad',
    'hub.challenge': '12345'
  }, 'secret');
  assert.equal(result.ok, false);
});

test('verifies Meta signature using raw body', () => {
  const body = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account' }));
  const secret = 'app-secret';
  const sig = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  const headers = { 'x-hub-signature-256': sig };
  assert.deepEqual(verifyMetaSignature(body, headers, secret), { ok: true });
});

test('extracts inbound text message', () => {
  const payload = {
    entry: [{ changes: [{ field: 'messages', value: {
      metadata: { phone_number_id: '123', display_phone_number: '+971500000000' },
      messages: [{ id: 'wamid.1', from: '971501234567', timestamp: '1', type: 'text', text: { body: 'اريد موعد' } }]
    } }] }]
  };
  const events = extractWhatsAppEvents(payload);
  assert.equal(events.length, 1);
  assert.equal(events[0].text, 'اريد موعد');
  const routed = classifyDABBIREvent(events[0], 'dabbir_clinics');
  assert.equal(routed.classification, 'APPOINTMENT_REQUEST');
  assert.ok(routed.workflow.includes('BOOKING'));
});

test('extracts WhatsApp Business App message echoes for coexistence', () => {
  const payload = {
    entry: [{ changes: [{ field: 'smb_message_echoes', value: {
      metadata: { phone_number_id: '123', display_phone_number: '+971500000000' },
      messages: [{ id: 'wamid.echo.1', from: '971500000000', to: '971501234567', timestamp: '2', type: 'text', text: { body: 'تم استلام طلبك' } }]
    } }] }]
  };
  const events = extractWhatsAppEvents(payload);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'app_message_echo');
  assert.equal(events[0].sourceField, 'smb_message_echoes');
  assert.equal(events[0].text, 'تم استلام طلبك');
  assert.equal(events[0].to, '971501234567');
});

test('extracts coexistence history messages', () => {
  const payload = {
    entry: [{ changes: [{ field: 'history', value: {
      phone_number_id: '123',
      history: { messages: [{ id: 'wamid.history.1', from: '971501234567', timestamp: '3', type: 'text', text: { body: 'رسالة سابقة' } }] }
    } }] }]
  };
  const events = extractWhatsAppEvents(payload);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'history_message');
  assert.equal(events[0].sourceField, 'history');
  assert.equal(events[0].text, 'رسالة سابقة');
});

test('extracts WhatsApp Business App state sync events', () => {
  const payload = {
    entry: [{ changes: [{ field: 'smb_app_state_sync', value: {
      phone_number_id: '123',
      state: 'SYNCED',
      timestamp: '4'
    } }] }]
  };
  const events = extractWhatsAppEvents(payload);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'app_state_sync');
  assert.equal(events[0].sourceField, 'smb_app_state_sync');
  assert.equal(events[0].state, 'SYNCED');
});
