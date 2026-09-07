import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const preload = fs.readFileSync(new URL('../api/_sentry-preload.js', import.meta.url), 'utf8');
const runtime = fs.readFileSync(new URL('../api/_sentry-runtime.js', import.meta.url), 'utf8');
const core = fs.readFileSync(new URL('../api/_sentry-core.js', import.meta.url), 'utf8');
const health = fs.readFileSync(new URL('../api/sentry-health.js', import.meta.url), 'utf8');
const browser = fs.readFileSync(new URL('../api/sentry-browser.js', import.meta.url), 'utf8');

const REQUIRED_FILES = ['api/_sentry-preload.js', 'api/_sentry-runtime.js', 'api/_sentry-core.js'];
const includesFile = (config, file) => String(config?.includeFiles || '').includes(file);

test('every Vercel function bundle preloads the Sentry runtime without build-time instrumentation', () => {
  assert.equal(vercel.env.NODE_OPTIONS, '--import=./api/_sentry-preload.js');
  const wildcard = vercel.functions['api/**/*.js'];
  assert.ok(wildcard, 'api/**/*.js function coverage is required');
  for (const file of REQUIRED_FILES) assert.ok(includesFile(wildcard, file), `${file} must be included globally`);

  for (const [pattern, config] of Object.entries(vercel.functions)) {
    if (pattern === 'api/**/*.js') continue;
    for (const file of REQUIRED_FILES) assert.ok(includesFile(config, file), `${pattern} must include ${file}`);
  }

  assert.match(preload, /AWS_LAMBDA_FUNCTION_NAME/);
  assert.match(preload, /AWS_EXECUTION_ENV/);
  assert.match(preload, /VERCEL_REGION/);
  assert.match(preload, /await import\('\.\/_sentry-runtime\.js'\)/);
  assert.doesNotMatch(preload, /SENTRY_DSN/);
});

test('server runtime captures structured DABBIR failures and ordinary labelled failures', () => {
  assert.match(runtime, /structuredDabbirLog/);
  assert.match(runtime, /String\(parsed\.product \|\| ''\)\.toUpperCase\(\) === 'DABBIR'/);
  assert.match(runtime, /source: 'structured_log'/);
  assert.match(runtime, /failure_class/);
  assert.match(runtime, /_failed/);
  assert.match(runtime, /uncaughtExceptionMonitor/);
  assert.match(runtime, /unhandledRejection/);
});

test('Sentry transport is HTTPS-only, bounded, release-aware, and redacts secrets', () => {
  assert.match(core, /\^https:\$/);
  assert.match(core, /AbortSignal\.timeout\(3000\)/);
  assert.match(core, /VERCEL_GIT_COMMIT_SHA/);
  assert.match(core, /\[redacted\]/);
  assert.match(core, /SENSITIVE_KEY/);
  assert.match(core, /stackFrames/);
});

test('health exposes instrumentation truth and probe remains preview-only', () => {
  assert.match(health, /runtime_instrumented/);
  assert.match(health, /captureSentryPreviewProbe/);
  assert.match(health, /VERCEL_ENV/);
  assert.match(health, /PREVIEW_ONLY/);
  assert.match(health, /transport_accepted/);
});

test('browser relay no longer claims success when Sentry rejects delivery', () => {
  assert.match(browser, /SENTRY_NOT_CONFIGURED/);
  assert.match(browser, /SENTRY_DELIVERY_FAILED/);
  assert.match(browser, /accepted \? 202 : 503/);
  assert.doesNotMatch(browser, /return json\(res, 202, \{ ok: true \}\);\s*}\s*catch/);
});

test('manual envelope transport reports provider acceptance and scrubs sensitive message content', async () => {
  const previousDsn = process.env.SENTRY_DSN;
  const previousEnv = process.env.VERCEL_ENV;
  const previousRelease = process.env.VERCEL_GIT_COMMIT_SHA;
  const previousFetch = globalThis.fetch;
  let request = null;

  process.env.SENTRY_DSN = 'https://public@example.ingest.sentry.io/123';
  process.env.VERCEL_ENV = 'preview';
  process.env.VERCEL_GIT_COMMIT_SHA = 'deadbeef';
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response('', { status: 200 });
  };

  try {
    const sentry = await import(`../api/_sentry-core.js?transport-test=${Date.now()}`);
    const accepted = await sentry.captureSentryMessage(
      'DABBIR_TEST?token=super-secret Bearer abc.def.ghi',
      { extra: { password: 'hidden', safe_code: 'OK' } },
    );
    assert.equal(accepted, true);
    assert.equal(request.url, 'https://example.ingest.sentry.io/api/123/envelope/');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers['content-type'], 'application/x-sentry-envelope');
    assert.doesNotMatch(request.options.body, /super-secret/);
    assert.doesNotMatch(request.options.body, /abc\.def\.ghi/);
    assert.doesNotMatch(request.options.body, /"password":"hidden"/);
    assert.match(request.options.body, /\[redacted\]/);

    const probe = await sentry.captureSentryPreviewProbe();
    assert.equal(probe.accepted, true);
    assert.equal(probe.status, 200);
    assert.match(probe.event_id, /^[0-9a-f]{32}$/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousDsn == null) delete process.env.SENTRY_DSN; else process.env.SENTRY_DSN = previousDsn;
    if (previousEnv == null) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previousEnv;
    if (previousRelease == null) delete process.env.VERCEL_GIT_COMMIT_SHA; else process.env.VERCEL_GIT_COMMIT_SHA = previousRelease;
  }
});
