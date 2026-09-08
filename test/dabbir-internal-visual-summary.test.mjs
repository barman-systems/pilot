import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scopedVisualCapabilities, visualAvailability, internalVisualSummary, emitInternalVisualSummary, assertInternalVisualGate } from '../.github/scripts/dabbir-internal-visual-summary.mjs';

const measured = (screen, overflow = false, extra = {}) => ({ screen, width: 390, height: 844, language: 'ar', status: 'PASS', overflow, ...extra });
const scopedProfile = (appointments = false) => ({ ok: true, json: { ok: true, business_id: 'qa-business', profile: { show_appointments: appointments, show_operations: false } } });

test('capability exclusions require an explicit boolean from the same successful tenant response', () => {
  assert.deepEqual(scopedVisualCapabilities(scopedProfile(), 'qa-business'), { appointments: false });
  assert.deepEqual(scopedVisualCapabilities(scopedProfile(true), 'qa-business'), { appointments: true });
  assert.deepEqual(scopedVisualCapabilities(scopedProfile(), 'other-business'), {});
  assert.deepEqual(scopedVisualCapabilities({ ...scopedProfile(), ok: false }, 'qa-business'), {});
  for (const value of [null, 0, 'false']) assert.deepEqual(scopedVisualCapabilities(scopedProfile(value), 'qa-business'), {});
  const missing = scopedProfile();
  delete missing.json.profile.show_appointments;
  assert.deepEqual(scopedVisualCapabilities(missing, 'qa-business'), {});
  assert.deepEqual(scopedVisualCapabilities(null, 'qa-business'), {});
});

test('an intentional missing appointment destination cannot excuse a visible broken control', () => {
  const hiddenAppointment = { screen: 'appointments', hasVisibleNavigation: false, hasTarget: false, capabilities: { appointments: false } };
  assert.equal(visualAvailability(hiddenAppointment), 'NOT_APPLICABLE');
  assert.equal(visualAvailability({ ...hiddenAppointment, hasVisibleNavigation: true }), 'BROKEN_TARGET');
  assert.equal(visualAvailability({ ...hiddenAppointment, hasVisibleNavigation: true, hasTarget: true }), 'READY');
  assert.equal(visualAvailability({ ...hiddenAppointment, capabilities: {} }), 'UNAVAILABLE');
  assert.equal(visualAvailability({ ...hiddenAppointment, capabilities: { appointments: true } }), 'UNAVAILABLE');
  assert.equal(visualAvailability({ ...hiddenAppointment, screen: 'operations' }), 'UNAVAILABLE');
});

test('summary counts measured baseline and team outcomes, never treating absent measurement as PASS', () => {
  const summary = internalVisualSummary({ cases: [
    measured('dashboard'), measured('settings', true),
    measured('appointments', false, { status: 'NOT_APPLICABLE' }),
    measured('tasks', false, { status: 'UNAVAILABLE' }),
    measured('customers', false, { status: 'BROKEN_TARGET' }),
    measured('operations', false, { status: 'ACTION_FAILED' }),
    { screen: 'analytics', width: 1440, height: 900, language: 'en', status: 'CAPTURED' },
  ], team: { language: 'en', cases: [{ width: 820, height: 1180, overflow: false }] } });
  assert.deepEqual(summary.counts, { PASS: 2, OVERFLOW: 1, UNAVAILABLE: 2, NOT_APPLICABLE: 1, BROKEN_TARGET: 1, ACTION_FAILED: 1 });
  assert.deepEqual(summary.cases.at(-1), { screen: 'team', viewport: { width: 820, height: 1180 }, language: 'en', status: 'PASS' });
});

test('log projection excludes all report payloads, arbitrary names, paths and errors', () => {
  const secret = 'sensitive-owner@example.com eyJ.private-token <html>customer content</html> data:image/png;base64,c2VjcmV0';
  const lines = [];
  emitInternalVisualSummary({ sha: secret, origin: secret, error: secret, auth: secret, cases: [
    measured('dashboard', false, { email: secret, file: secret, html: secret, error: secret, text200: { overflow: true, file: secret, method: secret } }),
    { screen: secret, language: secret, width: secret, height: Infinity, status: secret, text: secret },
  ], team: { language: secret, cases: [{ width: 390, height: 844, overflow: true, screenshot: secret }] } }, line => lines.push(line));
  for (const line of lines) {
    assert.doesNotMatch(line, /sensitive-owner|example\.com|eyJ|private-token|html|customer content|base64|c2VjcmV0/);
    const parsed = JSON.parse(line.slice(line.indexOf('=') + 1));
    for (const row of parsed.cases) assert.deepEqual(Object.keys(row), ['screen', 'viewport', 'language', 'status']);
  }
  assert.equal(JSON.parse(lines[0].split('=')[1]).interrupted, true);
});

test('baseline overflow and failed actions block the gate while text enlargement stays separately labelled', () => {
  const lines = [];
  const baseline = emitInternalVisualSummary({ cases: [measured('dashboard', false, { text200: { overflow: true } })] }, line => lines.push(line));
  assert.doesNotThrow(() => assertInternalVisualGate(baseline));
  assert.equal(baseline.counts.PASS, 1);
  assert.equal(baseline.counts.OVERFLOW, 0);
  assert.equal(JSON.parse(lines[1].split('=')[1]).counts.OVERFLOW, 1);
  assert.throws(() => assertInternalVisualGate(internalVisualSummary({ cases: [measured('dashboard', true)] })), /INTERNAL_VISUAL_VISIBLE_OVERFLOW/);
  for (const status of ['BROKEN_TARGET', 'ACTION_FAILED']) assert.throws(() => assertInternalVisualGate(internalVisualSummary({ cases: [measured('dashboard', false, { status })] })), /INTERNAL_VISUAL_ACTION_FAILED/);
  assert.throws(() => assertInternalVisualGate(internalVisualSummary({ cases: [], interrupted: true })), /INTERNAL_VISUAL_ACTION_FAILED/);
});

// Exercise the actual journey block with a fake Playwright page, filesystem and
// authenticated request. This does not launch a browser or contact any service.
const journeySource = fs.readFileSync(new URL('./ai-full-customer-journey-v2.mjs', import.meta.url), 'utf8');
const blockStart = journeySource.indexOf("  if (process.env.DABBIR_INTERNAL_VISUAL_QA === '1'");
const blockEnd = journeySource.indexOf('\n  // The functional report', blockStart);
assert.ok(blockStart > 0 && blockEnd > blockStart, 'visual runner contract moved');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const runVisualBlock = new AsyncFunction('process', 'REPORT_PATH', 'fs', 'ownerSession', 'businessId', 'page', 'browserContext', 'ORIGIN', 'scopedVisualCapabilities', 'visualAvailability', 'emitInternalVisualSummary', 'assertInternalVisualGate', journeySource.slice(blockStart, blockEnd));

async function simulate({ missingTarget, unavailable, failClick, overflowScreen, teamOverflow = false, profile = scopedProfile() } = {}) {
  const lines = [], reports = [], requests = [];
  const makePage = (team = false) => {
    const page = { current: team ? 'team' : 'dashboard', viewport: {},
      async setViewportSize(viewport) { this.viewport = viewport; },
      async goto() {}, async close() {}, async screenshot() {}, async waitForTimeout() {},
      async evaluate(fn) { return String(fn).includes('scrollWidth') ? (team ? teamOverflow : this.current === overflowScreen) : undefined; },
      locator(selector) {
        const navScreen = selector.match(/^#side \[data-screen="([a-z]+)"\]:visible$/)?.[1];
        const targetScreen = selector.match(/^#screen-([a-z]+)$/)?.[1];
        return {
          async count() {
            if (navScreen) return ['more', 'appointments', unavailable].includes(navScreen) ? 0 : 1;
            if (targetScreen) return targetScreen === missingTarget ? 0 : 1;
            return 0;
          },
          async click() { if (navScreen && navScreen === failClick) throw new Error('SIMULATED_CLICK_FAILURE'); if (navScreen) page.current = navScreen; },
          async waitFor() {}, async getAttribute() { return 'ar'; },
          first() { return this; }, async scrollIntoViewIfNeeded() {},
        };
      },
    };
    return page;
  };
  let error;
  try {
    await runVisualBlock({ env: { DABBIR_INTERNAL_VISUAL_QA: '1' } }, 'dabbir-ai-customer-journey-report.json',
      { mkdirSync() {}, writeFileSync(path, value) { reports.push(JSON.parse(value)); } },
      { async request(path, options) { requests.push({ path, options }); return profile; } },
      'qa-business', makePage(), { async newPage() { return makePage(true); } }, 'https://local.invalid',
      scopedVisualCapabilities, visualAvailability, visual => emitInternalVisualSummary(visual, line => lines.push(line)), assertInternalVisualGate);
  } catch (caught) { error = caught; }
  return { error, lines, reports, requests, summary: JSON.parse(lines[0].slice(lines[0].indexOf('=') + 1)) };
}

test('actual runner logs all 105 baseline cases and scopes intentional store exclusions', async () => {
  const result = await simulate();
  assert.equal(result.error, undefined);
  assert.equal(result.summary.cases.length, 105);
  assert.deepEqual(result.summary.counts, { PASS: 95, OVERFLOW: 0, UNAVAILABLE: 0, NOT_APPLICABLE: 10, BROKEN_TARGET: 0, ACTION_FAILED: 0 });
  assert.equal(result.summary.interrupted, false);
  assert.deepEqual(result.requests, [{ path: '/api/activity-tasks?business_id=qa-business', options: { retry: false } }]);
  assert.equal(JSON.parse(result.lines[1].split('=')[1]).cases.length, 8);
  assert.equal(result.reports.length, 1);
});

test('actual runner prints overflow metadata before failing owner and team overflow gates', async () => {
  for (const options of [{ overflowScreen: 'dashboard' }, { teamOverflow: true }]) {
    const result = await simulate(options);
    assert.match(result.error.message, /INTERNAL_VISUAL_VISIBLE_OVERFLOW/);
    assert.equal(result.summary.counts.OVERFLOW, options.teamOverflow ? 5 : 10);
    assert.equal(result.reports.length, 1);
  }
});

test('actual runner preserves a visible broken-target failure and emits its partial evidence', async () => {
  const result = await simulate({ missingTarget: 'tasks' });
  assert.match(result.error.message, /INTERNAL_VISUAL_BROKEN_TARGET/);
  assert.equal(result.summary.counts.BROKEN_TARGET, 1);
  assert.equal(result.summary.counts.PASS, 1);
  assert.equal(result.summary.interrupted, true);
  assert.equal(result.summary.cases.at(-1).screen, 'tasks');
  assert.equal(result.reports.length, 1);
});

test('actual runner preserves click failure rather than hiding it as an unavailable screen', async () => {
  const result = await simulate({ failClick: 'customers' });
  assert.match(result.error.message, /SIMULATED_CLICK_FAILURE/);
  assert.equal(result.summary.counts.ACTION_FAILED, 1);
  assert.equal(result.summary.counts.UNAVAILABLE, 0);
  assert.equal(result.summary.cases.at(-1).screen, 'customers');
  assert.equal(result.summary.interrupted, true);
});

test('actual runner reports unexplained absence separately and never trusts another business capability', async () => {
  const profile = scopedProfile();
  profile.json.business_id = 'other-business';
  const result = await simulate({ unavailable: 'analytics', profile });
  assert.equal(result.error, undefined);
  assert.equal(result.summary.counts.NOT_APPLICABLE, 0);
  assert.equal(result.summary.counts.UNAVAILABLE, 20);
  assert.equal(result.summary.counts.PASS, 85);
});
