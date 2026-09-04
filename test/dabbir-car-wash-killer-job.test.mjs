import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCarWashReceipt,
  CAR_WASH_AI_COST_POLICY,
  CAR_WASH_JOB_STATES,
  CAR_WASH_PERMISSIONS,
  findCarWashCapacity,
  parseCarWashInquiry,
  stableDemoIdentifiers,
  validateCarWashTransition,
} from '../api/_dabbir-car-wash-killer-job.js';

const allPermissions = Object.fromEntries(CAR_WASH_PERMISSIONS.map(permission => [permission, true]));
const now = new Date('2026-09-04T08:00:00.000Z');

test('vertical parser extracts a complete Arabic and English mixed inquiry without an AI call', () => {
  const parsed = parseCarWashInquiry('أبغى premium polish لسيارة SUV في Dubai Marina بكرة 11 am', { now });
  assert.equal(parsed.complete, true);
  assert.equal(parsed.package.key, 'premium');
  assert.equal(parsed.vehicle.key, 'suv');
  assert.equal(parsed.area.key, 'dubai_marina');
  assert.equal(parsed.preferredTime, '2026-09-05T07:00:00.000Z');
  assert.equal(parsed.source, 'deterministic_vertical_parser_v1');
  assert.ok(parsed.confidence.overall >= 0.9);
});

test('generic wash wording cannot override an explicit premium package', () => {
  const parsed = parseCarWashInquiry('premium wash لسيارة SUV في دبي مارينا غداً الساعة 10 صباحاً', { now });
  assert.equal(parsed.complete, true);
  assert.equal(parsed.package.key, 'premium');
  assert.equal(parsed.vehicle.key, 'suv');
  assert.equal(parsed.package.prices.suv, 220);
});

test('low-information inquiry asks exactly one specific question', () => {
  const parsed = parseCarWashInquiry('مرحبا، أريد غسيل سيارة', { now });
  assert.equal(parsed.complete, false);
  assert.equal(parsed.missing[0], 'package');
  assert.match(parsed.question, /باقة/);
  assert.doesNotMatch(parsed.question, /الموقع.*الوقت/s);
});

test('state machine accepts only the declared money-linked path', () => {
  const path = ['inquiry', 'qualified', 'offered', 'confirmed', 'assigned', 'reminded', 'completed', 'paid'];
  assert.deepEqual(CAR_WASH_JOB_STATES.slice(0, 8), path);
  for (let index = 1; index < path.length; index += 1) {
    assert.equal(validateCarWashTransition({ from: path[index - 1], to: path[index], actor: 'rule', permissions: allPermissions }).ok, true);
  }
  assert.deepEqual(validateCarWashTransition({ from: 'inquiry', to: 'paid', actor: 'ai', permissions: allPermissions }), { ok: false, code: 'ILLEGAL_JOB_TRANSITION' });
});

test('state machine enforces permissions, confidence, kill switch, shadow mode and lost reason', () => {
  assert.equal(validateCarWashTransition({ from: 'offered', to: 'confirmed', actor: 'ai', permissions: {}, confidence: 1 }).code, 'PERMISSION_BOOK_REQUIRED');
  assert.equal(validateCarWashTransition({ from: 'offered', to: 'confirmed', actor: 'ai', permissions: allPermissions, confidence: 0.5 }).code, 'LOW_CONFIDENCE_HUMAN_ESCALATION');
  assert.equal(validateCarWashTransition({ from: 'offered', to: 'confirmed', actor: 'ai', permissions: allPermissions, killSwitch: true }).code, 'KILL_SWITCH_ACTIVE');
  assert.equal(validateCarWashTransition({ from: 'offered', to: 'confirmed', actor: 'ai', permissions: allPermissions, operatorMode: 'shadow' }).code, 'SHADOW_MODE_NO_EXTERNAL_ACTION');
  assert.equal(validateCarWashTransition({ from: 'qualified', to: 'lost', actor: 'rule', permissions: allPermissions }).code, 'LOST_REASON_REQUIRED');
  assert.equal(validateCarWashTransition({ from: 'qualified', to: 'lost', actor: 'rule', permissions: allPermissions, reason: 'outside service area' }).ok, true);
});

test('owner override is explicit, human-only and reasoned', () => {
  assert.equal(validateCarWashTransition({ from: 'completed', to: 'assigned', actor: 'ai', ownerOverride: true, reason: 'rework' }).code, 'OWNER_OVERRIDE_REASON_REQUIRED');
  assert.equal(validateCarWashTransition({ from: 'completed', to: 'assigned', actor: 'human', ownerOverride: true, reason: 'Customer requested a documented rewash' }).override, true);
});

test('capacity assigns a valid team and accounts for duration plus travel buffer', () => {
  const result = findCarWashCapacity({
    requestedAt: '2026-09-05T07:00:00.000Z',
    durationMinutes: 90,
    travelMinutes: 30,
    areaKey: 'dubai_marina',
    teams: [
      { id: 'crew-a', name: 'Crew A', serviceAreas: ['dubai_marina'] },
      { id: 'crew-b', name: 'Crew B', serviceAreas: ['dubai_marina'] },
    ],
    bookings: [{ teamId: 'crew-a', status: 'confirmed', startsAt: '2026-09-05T06:30:00.000Z', endsAt: '2026-09-05T08:30:00.000Z' }],
    maxConcurrent: 2,
  });
  assert.equal(result.ok, true);
  assert.equal(result.slots[0].teamId, 'crew-b');
  assert.equal(result.slots[0].startsAt, '2026-09-05T07:00:00.000Z');
  assert.equal(result.slots[0].capacityEndsAt, '2026-09-05T09:00:00.000Z');
});

test('capacity rejects double booking when every crew is occupied', () => {
  const result = findCarWashCapacity({
    requestedAt: '2026-09-05T07:00:00.000Z',
    durationMinutes: 90,
    travelMinutes: 30,
    areaKey: 'dubai_marina',
    teams: [{ id: 'crew-a', name: 'Crew A', serviceAreas: ['dubai_marina'] }],
    bookings: [{ teamId: 'crew-a', status: 'confirmed', startsAt: '2026-09-05T04:00:00.000Z', endsAt: '2026-09-05T14:00:00.000Z' }],
    maxConcurrent: 1,
    candidates: 2,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'NO_CAPACITY');
});

test('demo identifiers are idempotent and receipt never calls booking value verified revenue', () => {
  const identifiers = stableDemoIdentifiers('demo-operation-123456789');
  assert.deepEqual(identifiers, stableDemoIdentifiers('demo-operation-123456789'));
  const inquiry = parseCarWashInquiry('premium SUV Dubai Marina tomorrow 11 am', { now });
  const receipt = buildCarWashReceipt({
    identifiers,
    inquiry,
    slot: { startsAt: inquiry.preferredTime, teamName: 'Crew A' },
    transitions: [{ from: 'inquiry', to: 'qualified' }, { from: 'qualified', to: 'offered' }, { from: 'offered', to: 'confirmed' }],
    bookingValue: 220,
    responseMs: 321,
  });
  assert.equal(receipt.external_side_effects, false);
  assert.equal(receipt.outcome.booking_value.classification, 'ESTIMATED');
  assert.equal(receipt.outcome.verified_revenue.classification, 'NOT_VERIFIED');
  assert.equal(receipt.outcome.recovered_revenue.classification, 'NOT_CLAIMED');
});

test('vertical AI cost policy keeps target 30 AED and hard cap 60 AED', () => {
  assert.equal(CAR_WASH_AI_COST_POLICY.targetMonthlyAed, 30);
  assert.equal(CAR_WASH_AI_COST_POLICY.hardMonthlyAed, 60);
  assert.equal(CAR_WASH_AI_COST_POLICY.deterministicFirst, true);
  assert.ok(CAR_WASH_AI_COST_POLICY.maxAgentSteps <= 4);
});
