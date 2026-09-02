import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const bridge = fs.readFileSync(new URL('api/dabbir-navigation-event-bridge-ui.js', root), 'utf8');
const router = fs.readFileSync(new URL('api/dabbir-contextual-navigation-ui.js', root), 'utf8');
const bundles = JSON.parse(fs.readFileSync(new URL('config/dabbir-ui-bundles.json', root), 'utf8'));
const recovery = fs.readFileSync(new URL('api/app-recovery.js', root), 'utf8');

test('navigation bridge delegates existing primary nav without owning destinations', () => {
  assert.match(bridge, /#nav > \[data-screen\],#bottomNav > \[data-screen\]/);
  assert.match(bridge, /document\.addEventListener\('click'/);
  assert.match(bridge, /document\.addEventListener\('touchend'/);
  assert.match(bridge, /typeof showScreen==='function'/);
  assert.match(bridge, /safeFallback/);
  assert.match(bridge, /destination_authority:'context-router'/);
  assert.doesNotMatch(bridge, /function normalizeName\(/);
  assert.doesNotMatch(bridge, /name==='appointments'/);
  assert.doesNotMatch(bridge, /name='dashboard'/);
  assert.doesNotMatch(bridge, /dataset\.screen\s*=(?!=)/);
  assert.doesNotMatch(bridge, /createElement\(['"](?:button|nav)['"]\)/);
});

test('store activity destination remains Operations under the contextual router', () => {
  assert.match(router, /setActivitySlot\(node,'operations',t\.operations\)/);
  assert.match(router, /authority:'primary-context-router'/);
  assert.match(bridge, /const name=String\(node\.dataset\?\.screen\|\|''\)\.trim\(\)/);
});

test('tab feedback paints before deferred screen rendering', () => {
  const activate = bridge.match(/function activate\(hit,source\)\{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.match(activate, /paint\(hit\)/);
  assert.match(activate, /afterPaint\(\(\)=>\{/);
  assert.ok(activate.indexOf('paint(hit)') < activate.indexOf("showScreen(hit.name)"));
  assert.match(bridge, /requestAnimationFrame\(\(\)=>requestAnimationFrame\(callback\)\)/);
  assert.match(bridge, /navigationEpoch/);
  assert.match(bridge, /visual_first:true/);
  assert.match(bridge, /deferred_render:true/);
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
