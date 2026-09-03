import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const bridge = fs.readFileSync(new URL('api/dabbir-navigation-event-bridge-ui.js', root), 'utf8');
const router = fs.readFileSync(new URL('api/dabbir-contextual-navigation-ui.js', root), 'utf8');
const bundles = JSON.parse(fs.readFileSync(new URL('config/dabbir-ui-bundles.json', root), 'utf8'));
const recovery = fs.readFileSync(new URL('api/app-recovery.js', root), 'utf8');

test('navigation bridge delegates primary destination choice to contextual routing', () => {
  assert.match(bridge, /#nav > \[data-screen\],#bottomNav > \[data-screen\]/);
  assert.match(bridge, /document\.addEventListener\('click'/);
  assert.match(bridge, /document\.addEventListener\('touchend'/);
  assert.match(bridge, /window\.__dabbirUiLifecycle/);
  assert.match(bridge, /lifecycle\.route\('navigation-event-bridge',routedName\)/);
  assert.match(bridge, /lifecycle\.on\('afterNavigate','navigation-event-bridge'/);
  assert.match(bridge, /safeFallback/);
  assert.match(bridge, /destination_authority:'context-router'/);
  assert.match(bridge, /window\.__dabbirContextualNavigation\?\.refresh\?\.\(\)/);
  assert.match(bridge, /document\.querySelector\('\[data-dabbir-activity-slot="true"\]'\)/);
  assert.doesNotMatch(bridge, /return ['"]operations['"]/);
  assert.doesNotMatch(bridge, /business_type/);
  assert.doesNotMatch(bridge, /dataset\.screen\s*=(?!=)/);
  assert.doesNotMatch(bridge, /createElement\(['"](?:button|nav)['"]\)/);
});

test('real iPhone touch navigation cannot be discarded by a redundant WebKit hit-test', () => {
  const touchEnd = bridge.match(/document\.addEventListener\('touchend',event=>\{([\s\S]*?)\n  \},\{capture:true,passive:false\}\);/)?.[1] || '';
  assert.match(touchEnd, /start\.node!==node/);
  assert.match(touchEnd, /distance>MAX_TAP_DISTANCE\|\|duration>MAX_TAP_DURATION/);
  assert.match(touchEnd, /const hit=resolve\(node\)/);
  assert.match(touchEnd, /activate\(hit,'touchend'\)/);
  assert.doesNotMatch(touchEnd, /document\.elementFromPoint\(/);
  assert.match(bridge, /version:'navigation-event-bridge-v6-real-iphone-touch'/);
  assert.match(bridge, /redundant_touch_hit_test:false/);
});

test('store activity stays Operations even if a stale appointments call reaches showScreen', () => {
  assert.match(router, /setActivitySlot\(node,'operations',t\.operations\)/);
  assert.match(router, /authority:'primary-context-router'/);
  assert.match(bridge, /if\(requested!==['"]appointments['"]\) return requested/);
  assert.match(bridge, /const routed=String\(slot\?\.dataset\?\.screen\|\|''\)\.trim\(\)/);
  assert.match(bridge, /return routed\|\|requested/);
  assert.match(bridge, /lifecycle\.route\('navigation-event-bridge',routedName\)/);
  assert.match(bridge, /window\.__dabbirShowScreenRouterDelegation='lifecycle'/);
  assert.match(bridge, /programmatic_show_screen_delegation:true/);
  assert.match(bridge, /lifecycle_router_authority:/);
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

test('navigation bridge remains immediately after contextual routing and shell module ceiling stays frozen', () => {
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
