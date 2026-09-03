import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const recovery = fs.readFileSync(new URL('../api/app-safari-recovery.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../api/app.js', import.meta.url), 'utf8');
const failOpen = fs.readFileSync(new URL('../api/dabbir-safari-auth-fail-open-ui.js', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

test('root shell bypasses stale Safari UI bundle versions', () => {
  assert.match(recovery, /UI_CACHE_BUST = '20260903-store-item-form-v1'/);
  assert.match(recovery, /dabbir-ui-critical\\\.js\\\?v=/);
  assert.match(recovery, /dabbir-ui-deferred\\\.js\\\?v=/);
  assert.match(recovery, /dabbir-owner-first-ui\\\?v=/);
  assert.match(recovery, /x-dabbir-ui-cache-bust/);
});

test('root shell injects an independent Safari auth fail-open watchdog', () => {
  assert.match(recovery, /dabbir-safari-auth-fail-open-ui/);
  assert.match(recovery, /injectSafariAuthFailOpen/);
  assert.match(failOpen, /BOOT_STALL_FAIL_OPEN/);
  assert.match(failOpen, /typeof globalThis\.AbortSignal\.timeout!=='function'/);
  assert.match(failOpen, /globalThis\.AbortSignal\.timeout=function/);
  assert.match(failOpen, /auth\.classList\.remove\('hidden'\)/);
  assert.match(failOpen, /loading\.style\.display='none'/);
  assert.doesNotMatch(failOpen, /response\.status===401/);
  assert.doesNotMatch(failOpen, /Promise\.race/);
});

test('fail-open never replaces a healthy visible gate', () => {
  assert.match(failOpen, /gateMissing\(\)/);
  assert.match(failOpen, /isHidden\(node\('authGate'\)\)/);
  assert.match(failOpen, /isHidden\(node\('onboardingGate'\)\)/);
  assert.match(failOpen, /isHidden\(node\('appShell'\)\)/);
  assert.match(failOpen, /if\(!gateMissing\(\)\) return/);
});

test('canonical root strips legacy store navigation overrides before delivery', () => {
  assert.match(app, /el\.style\.display=isStore\?'none':''/);
  assert.match(app, /name==='appointments'.*name='dashboard'/);
  assert.match(recovery, /LEGACY_STORE_SLOT_HIDE/);
  assert.match(recovery, /LEGACY_STORE_APPOINTMENT_REDIRECT/);
  assert.match(recovery, /stripLegacyNavigationOverrides/);
  assert.match(recovery, /split\(LEGACY_STORE_SLOT_HIDE\)\.join\(''\)/);
  assert.match(recovery, /split\(LEGACY_STORE_APPOINTMENT_REDIRECT\)\.join\(''\)/);
  assert.match(recovery, /x-dabbir-navigation-authority/);
  assert.match(recovery, /context-router/);
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