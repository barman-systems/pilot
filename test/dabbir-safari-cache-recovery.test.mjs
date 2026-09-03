import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import appSafariRecoveryHandler from '../api/app-safari-recovery.js';

const recovery = fs.readFileSync(new URL('../api/app-safari-recovery.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../api/app.js', import.meta.url), 'utf8');
const failOpen = fs.readFileSync(new URL('../api/dabbir-safari-auth-fail-open-ui.js', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

function renderCanonicalRoot(){
  const headers=new Map();
  let body='';
  const res={
    _status:200,
    setHeader(name,value){headers.set(String(name).toLowerCase(),String(value));return this},
    getHeader(name){return headers.get(String(name).toLowerCase())},
    removeHeader(name){headers.delete(String(name).toLowerCase())},
    end(value=''){body=String(value);return this},
    set statusCode(value){this._status=Number(value)},
    get statusCode(){return this._status},
  };
  appSafariRecoveryHandler({method:'GET',headers:{}},res);
  return {body,headers,status:res.statusCode};
}

test('root shell bypasses stale Safari UI bundle versions', () => {
  assert.match(recovery, /UI_CACHE_BUST = '20260903-chat-render-lifecycle-v3'/);
  assert.match(recovery, /dabbir-ui-critical\\\.js\\\?v=/);
  assert.match(recovery, /dabbir-ui-deferred\\\.js\\\?v=/);
  assert.match(recovery, /dabbir-owner-first-ui\\\?v=/);
  assert.match(recovery, /x-dabbir-ui-cache-bust/);
});

test('owner-first authority reconciles one known malformed token, parses, probes, and executes before auth boot first paint', () => {
  assert.match(recovery,/ownerFirstInlineScript/);
  assert.match(recovery,/reconcileOwnerFirstPayload/);
  assert.match(recovery,/OWNER_FIRST_BROKEN_PREFIX/);
  assert.match(recovery,/OWNER_FIRST_FIXED_PREFIX/);
  assert.match(recovery,/DABBIR_OWNER_FIRST_PREFIX_RECONCILIATION_COUNT_/);
  assert.match(recovery,/DABBIR_OWNER_FIRST_INLINE_STATUS_/);
  assert.match(recovery,/DABBIR_OWNER_FIRST_INLINE_AUTHORITY_MISSING/);
  assert.match(recovery,/DABBIR_OWNER_FIRST_INLINE_UNSAFE_SCRIPT_CLOSE/);
  assert.match(recovery,/DABBIR_OWNER_FIRST_INLINE_PARSE_/);
  assert.match(recovery,/new Script\(payload/);
  assert.match(recovery,/dabbir-owner-first-probe/);
  assert.match(recovery,/DABBIR_OWNER_FIRST_SCRIPT_COUNT_/);
  assert.match(recovery,/DABBIR_AUTH_BOOT_ANCHOR_COUNT_/);
  const {body,headers,status}=renderCanonicalRoot();
  assert.equal(status,200);
  const externalOwnerTags=body.match(/<script src="\/api\/dabbir-owner-first-ui\?v=[^"\s<]+"><\/script>/g)||[];
  const inlineOwnerTags=body.match(/<script data-dabbir-owner-first-inline="owner-first-v4">/g)||[];
  const probeTags=body.match(/<script data-dabbir-owner-first-probe="owner-first-probe-v1">/g)||[];
  assert.equal(externalOwnerTags.length,0,'first paint must not depend on an owner-first subresource request');
  assert.equal(probeTags.length,1,'exactly one first-paint execution probe must exist');
  assert.equal(inlineOwnerTags.length,1,'exactly one owner-first inline authority must execute');
  assert.doesNotMatch(body,/const prefix=raw\.includes\('•'\).*\+' ':';/,'malformed owner-first prefix must not reach final HTML');
  assert.match(body,/const prefix=raw\.includes\('•'\).*\+' ':'';/,'reconciled owner-first prefix must reach final HTML');
  const renderIndex=body.indexOf('function renderAll()');
  const probeIndex=body.indexOf(probeTags[0]);
  const ownerIndex=body.indexOf(inlineOwnerTags[0]);
  const authorityIndex=body.indexOf("window.__dabbirUiAuthority={version:'owner-first-v4'",ownerIndex);
  const bootIndex=body.indexOf('applyLang();boot();');
  assert.ok(renderIndex>=0 && probeIndex>renderIndex && ownerIndex>probeIndex && authorityIndex>ownerIndex && bootIndex>authorityIndex,`render=${renderIndex} probe=${probeIndex} owner=${ownerIndex} authority=${authorityIndex} boot=${bootIndex}`);
  assert.equal(headers.get('x-dabbir-first-paint-authority'),'owner-first-compiled-reconciled-before-auth-boot-v4');
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
