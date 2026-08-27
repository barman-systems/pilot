import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, 'ai-full-customer-journey-v2.mjs'), 'utf8');

function must(pattern, message) {
  assert.match(source, pattern, message);
}

function mustNot(pattern, message) {
  assert.doesNotMatch(source, pattern, message);
}

test('store full journey verifies the appointment guard instead of demanding an invalid appointment', () => {
  must(/business_type:\s*'store'/, 'the journey tenant is intentionally a store');
  must(/21_store_appointment_guard_enforced/, 'store journey must test the store appointment guard');
  must(/result\.status === 400/, 'store appointment must be expected to reject');
  must(/result\.json\?\.error === 'APPOINTMENT_CREATE_FAILED'/, 'journey must verify the runtime rejection contract');
  must(/external_side_effects === false/, 'rejection must remain side-effect free');
  must(/STORE_APPOINTMENT_UNEXPECTEDLY_PERSISTED/, 'journey must prove a rejected store appointment did not persist');
  mustNot(/21_future_appointment_persists/, 'stale appointment-success expectation must not return');
});

test('mobile journey targets exactly one visible operations navigation control', () => {
  must(/#side\.open \[data-screen=\\"operations\\"\]:visible/, 'mobile selector must exclude hidden activity-specific duplicate controls');
  must(/visibleOperationsCount === 1/, 'journey must detect genuinely duplicated visible navigation');
  mustNot(/page\.locator\('#side \[data-screen=\\"operations\\"\]'\)\.click\(\)/, 'ambiguous strict locator must not return');
});
