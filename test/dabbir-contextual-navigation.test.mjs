import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const shell = fs.readFileSync(new URL('../api/app-recovery.js', import.meta.url), 'utf8');
const services = fs.readFileSync(new URL('../api/service-operations-ui.js', import.meta.url), 'utf8');
const guard = fs.readFileSync(new URL('../api/dabbir-contextual-navigation-ui.js', import.meta.url), 'utf8');

test('service operations still exists but its injected sixth primary nav is hidden', () => {
  assert.match(services, /id='dabbirServicesNav'/);
  assert.match(guard, /#dabbirServicesNav\{display:none!important\}/);
  assert.match(guard, /aria-hidden/);
});

test('service businesses reach Services from More instead of a sixth primary destination', () => {
  assert.match(guard, /id='dabbirContextServices'/);
  assert.match(guard, /#screen-more \.moreGrid/);
  assert.match(guard, /showScreen\('operations'\)/);
  assert.match(guard, /title:'الخدمات'/);
  assert.match(guard, /businessType\(\).*!==\s*'store'/s);
});

test('contextual navigation guard loads after service and owner UX layers', () => {
  assert.match(shell, /\/api\/dabbir-contextual-navigation-ui/);
  assert.ok(shell.indexOf('/api/dabbir-contextual-navigation-ui') > shell.indexOf('/api/service-operations-ui'));
  assert.ok(shell.indexOf('/api/dabbir-contextual-navigation-ui') > shell.indexOf('/api/owner-copilot-ui'));
});

test('guard is event-driven and does not add continuous DOM polling', () => {
  assert.doesNotMatch(guard, /MutationObserver/);
  assert.doesNotMatch(guard, /setInterval/);
});
