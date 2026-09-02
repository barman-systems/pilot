import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const recovery = fs.readFileSync(new URL('../api/app-safari-recovery.js', import.meta.url), 'utf8');
const failOpen = fs.readFileSync(new URL('../api/dabbir-safari-auth-fail-open-ui.js', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

test('root shell bypasses stale Safari UI bundle versions', () => {
  assert.match(recovery, /UI_CACHE_BUST = '20260902-p0-safari-v2'/);
  assert.match(recovery, /dabbir-ui-critical\\\.js\\\?v=/);
  assert.match(recovery, /dabbir-ui-deferred\\\.js\\\?v=/);
  assert.match(recovery, /dabbir-owner-first-ui\\\?v=/);
  assert.match(recovery, /x-dabbir-ui-cache-bust/);
});

test('root shell injects an independent Safari auth fail-open watchdog', () => {
  assert.match(recovery, /dabbir-safari-auth-fail-open-ui/);
  assert.match(recovery, /injectSafariAuthFailOpen/);
  assert.match(failOpen, /BOOT_WATCHDOG/);
  assert.match(failOpen, /response\.status===401/);
  assert.match(failOpen, /typeof window\.showGate==='function'/);
  assert.match(failOpen, /auth\.classList\.remove\('hidden'\)/);
  assert.doesNotMatch(failOpen, /AbortSignal\.timeout/);
});

test('fail-open never replaces a healthy visible gate', () => {
  assert.match(failOpen, /gateMissing\(\)/);
  assert.match(failOpen, /isHidden\(node\('authGate'\)\)/);
  assert.match(failOpen, /isHidden\(node\('onboardingGate'\)\)/);
  assert.match(failOpen, /isHidden\(node\('appShell'\)\)/);
  assert.match(failOpen, /status===401&&gateMissing\(\)/);
});

test('root route uses Safari recovery shell and includes index.html', () => {
  const rootRoute = vercel.routes.find((route) => route.src === '^/$');
  const rootRewrite = vercel.rewrites.find((rewrite) => rewrite.source === '/');
  assert.equal(rootRoute?.dest, '/api/app-safari-recovery');
  assert.equal(rootRewrite?.destination, '/api/app-safari-recovery');
  assert.equal(vercel.functions?.['api/app-safari-recovery.js']?.includeFiles, 'index.html');
});

test('generated DABBIR UI bundles cannot remain fresh in Safari after a deployment', () => {
  const uiHeader = vercel.headers.find((entry) => entry.source.includes('dabbir-ui-(critical|deferred)'));
  const cacheControl = uiHeader?.headers?.find((header) => String(header.key).toLowerCase() === 'cache-control');
  assert.equal(cacheControl?.value, 'no-store, max-age=0');
});
