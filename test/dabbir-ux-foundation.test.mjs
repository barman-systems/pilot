import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const index = read('index.html');
const shell = read('api/app-recovery.js');
const recovery = read('api/auth/recovery-ui.js');
const resend = read('api/auth/resend-verification.js');
const activation = read('api/customer-activation-ui.js');
const chat = read('api/chat-human-ui.js');
const preferences = read('api/user-preferences.js');
const feedback = read('api/feedback.js');
const uxEvents = read('api/ux-events.js');
const uxEventsMigration = read('supabase/migrations/20260830130000_dabbir_ux_event_metrics_v1.sql');
const migration = read('supabase/migrations/20260830124500_dabbir_ux_preferences_feedback_v1.sql');
const [{ default: resendHandler }, { default: preferencesHandler }, { default: feedbackHandler }, { default: uxEventsHandler }] = await Promise.all([
  import('../api/auth/resend-verification.js'),
  import('../api/user-preferences.js'),
  import('../api/feedback.js'),
  import('../api/ux-events.js'),
]);

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    end(value = '') { this.body = String(value); },
  };
}

test('public auth UX has field validation, password visibility, strength guidance and resend verification', () => {
  for (const marker of [
    'dabbirPasswordToggle',
    'dabbirPasswordBar',
    'dabbirAuthEmailError',
    'dabbirAuthFieldError',
    'dabbirResendVerification',
    '/api/auth/resend-verification',
    'passwordScore',
    'aria-invalid',
  ]) assert.match(recovery, new RegExp(marker.replaceAll('/', '\\/')));
  assert.match(recovery, /ar:\{forgot:/);
  assert.match(recovery, /en:\{forgot:/);
});

test('new UX APIs fail closed before any provider or database call', async () => {
  const resendResponse = responseRecorder();
  await resendHandler({ method: 'GET', headers: {} }, resendResponse);
  assert.equal(resendResponse.statusCode, 405);

  const noOriginResponse = responseRecorder();
  await feedbackHandler({ method: 'POST', headers: {} }, noOriginResponse);
  assert.equal(noOriginResponse.statusCode, 403);

  const eventNoOriginResponse = responseRecorder();
  await uxEventsHandler({ method: 'POST', headers: {} }, eventNoOriginResponse);
  assert.equal(eventNoOriginResponse.statusCode, 403);

  const unauthenticatedResponse = responseRecorder();
  await preferencesHandler({ method: 'GET', headers: {}, url: '/api/user-preferences?business_id=00000000-0000-4000-8000-000000000000' }, unauthenticatedResponse);
  assert.equal(unauthenticatedResponse.statusCode, 401);
});

test('verification resend is same-origin, bounded and enumeration-safe', () => {
  assert.match(resend, /requireSameOrigin\(req\)/);
  assert.match(resend, /readJsonBody\(req, 2048\)/);
  assert.match(resend, /email\.length > 254/);
  assert.match(resend, /\/auth\/v1\/resend/);
  assert.match(resend, /verification_requested: true/);
  assert.doesNotMatch(resend, /USER_NOT_FOUND|EMAIL_NOT_FOUND|already exists/i);
});

test('base shell exposes progressive onboarding, bounded API waits, modal focus and confirmation', () => {
  assert.match(index, /class="onboardingProgress"/);
  assert.match(index, /setupStepAccount/);
  assert.match(index, /setupStepBusiness/);
  assert.match(index, /AbortSignal\.timeout/);
  assert.match(index, /function openModal\(id,focusId\)/);
  assert.match(index, /aria-labelledby="newChatTitle"/);
  assert.match(index, /window\.__dabbirConfirm/);
  assert.match(index, /button:active:not\(:disabled\)/);
  assert.match(index, /prefers-reduced-motion:reduce/);
  assert.match(shell, /const UI_BUNDLE_VERSION = '[^']+'/);
  assert.match(shell, /dabbir-ui-critical\.js\?v=\$\{UI_BUNDLE_VERSION\}/);
  assert.match(shell, /dabbir-ui-deferred\.js\?v=\$\{UI_BUNDLE_VERSION\}/);
});

test('workspace UX foundation covers discovery, empty states, preferences, feedback and first-run guidance', () => {
  for (const marker of [
    '__dabbirUxFoundationV1',
    'uxSearchButton',
    'uxScreenTools',
    'enrichEmptyStates',
    'uxDashboardPrefs',
    'uxNotificationPreferences',
    'uxFeedbackForm',
    'startTour',
    '/api/user-preferences',
    '/api/feedback',
    'window.__dabbirConfirm',
    'applyNotificationVisibility',
    'window.__dabbirTrackUx',
    '/api/ux-events',
    'workspace_first_value',
  ]) assert.match(activation, new RegExp(marker.replaceAll('/', '\\/')));
  assert.match(activation, /const copy=\{/);
  assert.match(activation, /ar:\{search:/);
  assert.match(activation, /en:\{search:/);
  assert.match(activation, /addEventListener\('offline'/);
  assert.match(activation, /prefers-reduced-motion/);
});

test('human takeover and return actions require explicit confirmation', () => {
  assert.match(chat, /window\.__dabbirConfirm/);
  assert.match(chat, /takeoverConfirmTitle/);
  assert.match(chat, /returnConfirmTitle/);
  assert.match(chat, /if\(!confirmed\)return/);
});

test('preference and feedback APIs are authenticated, membership scoped and same-origin on writes', () => {
  for (const source of [preferences, feedback]) {
    assert.match(source, /getVerifiedUser/);
    assert.match(source, /getBusinessMemberships/);
    assert.match(source, /requireSameOrigin/);
    assert.match(source, /business_id/);
  }
  assert.match(preferences, /METRIC_KEYS/);
  assert.match(preferences, /resolution=merge-duplicates/);
  assert.match(feedback, /message\.length < 3 \|\| message\.length > 2000/);
  assert.match(feedback, /CONTEXT_KEYS/);
});

test('UX event API and migration collect bounded non-content metrics under membership RLS', () => {
  assert.match(uxEvents, /const EVENTS = new Set/);
  assert.match(uxEvents, /CONTEXT_KEYS/);
  assert.match(uxEvents, /duration > 86400000/);
  assert.match(uxEvents, /requireSameOrigin/);
  assert.match(uxEvents, /getBusinessMemberships/);
  assert.doesNotMatch(uxEvents, /body\.(message|customer_name|email)|customer_text|conversation_body/);
  assert.match(uxEventsMigration, /create table if not exists public\.dabbir_ux_events/);
  assert.match(uxEventsMigration, /alter table public\.dabbir_ux_events enable row level security/);
  assert.match(uxEventsMigration, /membership\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(uxEventsMigration, /grant insert on public\.dabbir_ux_events to authenticated/);
});

test('UX persistence migration enables RLS and limits rows to active business members', () => {
  assert.match(migration, /create table if not exists public\.dabbir_user_preferences/);
  assert.match(migration, /create table if not exists public\.dabbir_feedback/);
  assert.match(migration, /alter table public\.dabbir_user_preferences enable row level security/);
  assert.match(migration, /alter table public\.dabbir_feedback enable row level security/);
  assert.match(migration, /membership\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /membership\.status = 'active'/);
  assert.match(migration, /revoke all on public\.dabbir_feedback from anon/);
  assert.match(migration, /dabbir_user_preferences_business_idx/);
});
