import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyClinicMessage, extractClinicSignals } from '../api/dabbir-runtime.js';

const cases = [
  ['ابا موعد باجر العصر', 'APPOINTMENT_REQUEST', ['TOMORROW','AFTERNOON']],
  ['ممكن اغير موعدي لباجر؟', 'RESCHEDULE_APPOINTMENT', ['TOMORROW']],
  ['أبغي ألغي الموعد', 'CANCEL_APPOINTMENT', []],
  ['Can I move my appointment to tomorrow evening?', 'RESCHEDULE_APPOINTMENT', ['TOMORROW','EVENING']],
  ['ابي اللوكيشن', 'LOCATION_REQUEST', []],
  ['متى تفتحون باجر؟', 'BUSINESS_HOURS', ['TOMORROW']],
  ['I need a booking tomorrow afternoon', 'APPOINTMENT_REQUEST', ['TOMORROW','AFTERNOON']],
  ['ابا book appointment باجر', 'APPOINTMENT_REQUEST', ['TOMORROW']],
];

test('clinic intent golden set covers UAE/Gulf Arabic and mixed-language messages', () => {
  for (const [message, expectedIntent, expectedTemporal] of cases) {
    assert.equal(classifyClinicMessage(message), expectedIntent, message);
    const signals = extractClinicSignals(message);
    for (const temporal of expectedTemporal) assert.ok(signals.temporal.includes(temporal), `${message}: missing ${temporal}`);
  }
});
