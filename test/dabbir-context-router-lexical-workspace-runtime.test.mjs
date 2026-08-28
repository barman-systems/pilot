import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../api/dabbir-contextual-navigation-ui.js', import.meta.url), 'utf8');
const match = source.match(/const script=String\.raw`([\s\S]*?)`;\n\nexport default/);
assert.ok(match?.[1], 'CONTEXT_ROUTER_BROWSER_SCRIPT_NOT_FOUND');
const browserScript = match[1];

function node(screen) {
  const label = { textContent: '' };
  return {
    dataset: { screen },
    style: { display: 'none' },
    label,
    querySelector(selector) { return selector === '[data-label]' ? label : null; },
    setAttribute(name, value) { this[name] = value; },
    addEventListener() {},
  };
}

test('store lexical workspace converts both shared activity slots to Operations', async () => {
  const side = node('appointments');
  const bottom = node('appointments');
  const all = [side, bottom];
  const document = {
    documentElement: { lang: 'en' },
    querySelector(selector) {
      if (selector === '#menuBtn') return null;
      if (selector === '#screen-more .moreGrid') return null;
      if (selector === '#dabbirContextServices') return null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector.includes('appointments')) return all.filter(item => item.dataset.screen === 'appointments');
      if (selector === '[data-dabbir-activity-slot="true"]') return all.filter(item => item.dataset.dabbirActivitySlot === 'true');
      return [];
    },
    createElement() { throw new Error('UNEXPECTED_CREATE_ELEMENT'); },
  };
  const context = {
    window: {},
    document,
    workspace: { business: { business_type: 'store' } },
    current: 'dashboard',
    T: () => ({ appointments: 'Appointments' }),
    showScreen() {},
    renderAll() {},
    applyLang() {},
    setTimeout(fn) { fn(); return 1; },
    clearTimeout() {},
  };
  vm.createContext(context);
  vm.runInContext(browserScript, context);
  assert.equal(side.dataset.screen, 'operations');
  assert.equal(bottom.dataset.screen, 'operations');
  assert.equal(side.style.display, '');
  assert.equal(bottom.style.display, '');
  assert.equal(side.label.textContent, 'Operations');
  assert.equal(bottom.label.textContent, 'Operations');
  assert.equal(context.window.__dabbirContextualNavigation.workspace_authority, 'lexical');
});
