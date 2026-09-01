import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const bridge = fs.readFileSync(new URL('api/dabbir-navigation-event-bridge-ui.js', root), 'utf8');
const bundles = JSON.parse(fs.readFileSync(new URL('config/dabbir-ui-bundles.json', root), 'utf8'));
const recovery = fs.readFileSync(new URL('api/app-recovery.js', root), 'utf8');

test('navigation bridge delegates existing primary nav without owning destinations', () => {
  assert.match(bridge, /#nav > \[data-screen\],#bottomNav > \[data-screen\]/);
  assert.match(bridge, /document\.addEventListener\('click'/);
  assert.match(bridge, /document\.addEventListener\('touchend'/);
  assert.match(bridge, /typeof showScreen==='function'/);
  assert.match(bridge, /safeFallback/);
  assert.doesNotMatch(bridge, /dataset\.screen\s*=/);
  assert.doesNotMatch(bridge, /createElement\(['"](?:button|nav)['"]\)/);
});

test('navigation bridge is deferred after contextual routing and shell module count stays frozen', () => {
  const modules=[...bundles.critical,...bundles.deferred];
  const routerIndex=bundles.deferred.indexOf('/api/dabbir-contextual-navigation-ui');
  const bridgeIndex=bundles.deferred.indexOf('/api/dabbir-navigation-event-bridge-ui');
  assert.ok(routerIndex>=0);
  assert.equal(bridgeIndex,routerIndex+1);
  assert.equal(modules.length,26);
  assert.equal(new Set(modules).size,modules.length);
});

test('owner-first UI remains independently bootstrapped rather than duplicated in deferred bundle', () => {
  assert.match(recovery, /OWNER_FIRST_UI_BOOTSTRAP/);
  assert.match(recovery, /\/api\/dabbir-owner-first-ui/);
  assert.equal(bundles.deferred.includes('/api/dabbir-owner-first-ui'),false);
});
