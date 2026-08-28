import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const shell = fs.readFileSync(new URL('../api/app-recovery.js', import.meta.url), 'utf8');
const ownerOperations = fs.readFileSync(new URL('../api/owner-operations-ui.js', import.meta.url), 'utf8');
const services = fs.readFileSync(new URL('../api/service-operations-ui.js', import.meta.url), 'utf8');
const router = fs.readFileSync(new URL('../api/dabbir-contextual-navigation-ui.js', import.meta.url), 'utf8');

test('feature operation modules do not own primary navigation', () => {
  for (const source of [ownerOperations, services]) {
    assert.doesNotMatch(source, /function\s+ensureNav\s*\(/);
    assert.doesNotMatch(source, /\.dataset\.screen\s*=/);
  }
  assert.doesNotMatch(services, /dabbirServicesNav/);
  assert.doesNotMatch(router, /dabbirServicesNav/);
});

test('store resolves the shared activity slot to Operations in the router', () => {
  assert.match(router, /data-dabbir-activity-slot/);
  assert.match(router, /setActivitySlot\(node,'operations',t\.operations\)/);
  assert.match(router, /setActivitySlot\(node,'appointments'/);
  assert.match(router, /authority:'primary-context-router'/);
});

test('opening the mobile menu re-enforces the same activity-slot authority', () => {
  assert.match(router, /function bindMobileMenuResync\(\)/);
  assert.match(router, /q\('#menuBtn'\)/);
  assert.match(router, /dabbirContextRouterBound/);
  assert.match(router, /menu\.addEventListener\('click'/);
  assert.match(router, /requestAnimationFrame\(enforce\)/);
  assert.match(router, /mobile_menu_resync:true/);
});

test('service businesses reach Services from More instead of a sixth primary destination', () => {
  assert.match(router, /id='dabbirContextServices'/);
  assert.match(router, /#screen-more \.moreGrid/);
  assert.match(router, /showScreen\('operations'\)/);
  assert.match(router, /servicesTitle:'الخدمات'/);
  assert.match(router, /const isServiceBusiness=\(\)=>Boolean\(businessType\(\)\)&&!isStore\(\)/);
});

test('contextual navigation loads after service and owner UX layers', () => {
  assert.match(shell, /\/api\/dabbir-contextual-navigation-ui/);
  assert.ok(shell.indexOf('/api/dabbir-contextual-navigation-ui') > shell.indexOf('/api/service-operations-ui'));
  assert.ok(shell.indexOf('/api/dabbir-contextual-navigation-ui') > shell.indexOf('/api/owner-operations-ui'));
  assert.ok(shell.indexOf('/api/dabbir-contextual-navigation-ui') > shell.indexOf('/api/owner-copilot-ui'));
});

test('contextual navigation is event-driven and does not add continuous DOM polling', () => {
  assert.doesNotMatch(router, /MutationObserver/);
  assert.doesNotMatch(router, /setInterval/);
});
