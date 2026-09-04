import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import handler, { runMarketDemo } from '../api/dabbir-market-demo.js';

const now = new Date('2026-09-04T08:00:00.000Z');
const payload = {
  operation_id: 'demo_operation_1234567890',
  message: 'أحتاج premium polish لسيارة SUV في Dubai Marina بكرة الساعة 11 am',
};

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = String(value); return this; },
    status(code) { this.statusCode = code; return this; },
    end(value = '') { this.body = String(value); return this; },
  };
}

function request({ method = 'POST', body = payload, origin = 'https://preview.dabbir.test' } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.headers = { origin, host: 'preview.dabbir.test', 'x-forwarded-for': '203.0.113.41' };
  req.socket = { remoteAddress: '203.0.113.41' };
  queueMicrotask(() => {
    if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  });
  return req;
}

test('pre-signup demo converts a qualified inquiry to an auditable sandbox booking', async () => {
  const result = await runMarketDemo(payload, { now });
  assert.equal(result.ok, true);
  assert.equal(result.state, 'converted');
  assert.equal(result.booking.status, 'reminded');
  assert.equal(result.booking.price_aed, 220);
  assert.equal(result.truth.real_whatsapp_connected, false);
  assert.equal(result.truth.external_messages_sent, false);
  assert.equal(result.receipt.external_side_effects, false);
  assert.deepEqual(result.receipt.execution.transitions.map(item => item.to), ['qualified', 'offered', 'confirmed', 'assigned', 'reminded']);
  assert.equal(result.receipt.outcome.booking_value.classification, 'ESTIMATED');
  assert.equal(result.receipt.outcome.verified_revenue.amount, 0);
});

test('pre-signup demo is deterministic for a repeated operation and payload', async () => {
  const first = await runMarketDemo(payload, { now });
  const replay = await runMarketDemo(payload, { now });
  assert.equal(first.booking.id, replay.booking.id);
  assert.equal(first.receipt.id, replay.receipt.id);
});

test('demo asks one question when confidence is incomplete instead of inventing data', async () => {
  const result = await runMarketDemo({ operation_id: payload.operation_id, message: 'أريد غسيل سيارة' }, { now });
  assert.equal(result.state, 'needs_detail');
  assert.equal(result.missing[0], 'package');
  assert.ok(result.question);
  assert.equal(result.receipt, undefined);
});

test('demo endpoint requires same-origin writes and exposes a truthful public catalog', async () => {
  const blocked = response();
  await handler(request({ origin: 'https://attacker.invalid' }), blocked);
  assert.equal(blocked.statusCode, 403);
  assert.equal(JSON.parse(blocked.body).error, 'ORIGIN_REQUIRED');

  const catalogResponse = response();
  await handler(request({ method: 'GET', body: undefined }), catalogResponse);
  const catalog = JSON.parse(catalogResponse.body);
  assert.equal(catalogResponse.statusCode, 200);
  assert.equal(catalog.catalog.truth.mode, 'SANDBOX');
  assert.equal(catalog.catalog.truth.real_whatsapp_connected, false);
  assert.equal(catalog.catalog.limits.hardMonthlyAed, 60);
});
