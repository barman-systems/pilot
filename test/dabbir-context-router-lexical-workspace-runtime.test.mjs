import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../api/dabbir-contextual-navigation-ui.js', import.meta.url), 'utf8');
const match = source.match(/const script=String\.raw`([\s\S]*?)`;\n\nexport default/);
assert.ok(match?.[1], 'CONTEXT_ROUTER_BROWSER_SCRIPT_NOT_FOUND');
const browserScript = match[1];

function navNode(screen) {
  const label = { textContent: '' };
  const classes = new Set(['navBtn']);
  const style = {
    display: 'none',
    removeProperty(name) { if (name === 'display') this.display = ''; },
  };
  return {
    dataset: { screen },
    hidden: true,
    style,
    label,
    classList: {
      remove(value) { classes.delete(value); },
      contains(value) { return classes.has(value); },
    },
    querySelector(selector) { return selector === '[data-label]' ? label : null; },
    setAttribute(name, value) { this[name] = value; },
    addEventListener() {},
  };
}

test('store lexical workspace converts side and bottom activity slots to visible Operations', () => {
  const side = navNode('appointments');
  const bottom = navNode('appointments');
  side.classList.remove = value => { if (value === 'hidden') side.hiddenClassRemoved = true; };
  bottom.classList.remove = value => { if (value === 'hidden') bottom.hiddenClassRemoved = true; };
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
      if (selector.includes('appointments') || selector.includes('operations')) {
        return all.filter(item => selector.includes(`data-screen="${item.dataset.screen}"`));
      }
      if (selector === '[data-dabbir-activity-slot="true"]') {
        return all.filter(item => item.dataset.dabbirActivitySlot === 'true');
      }
      return [];
    },
    addEventListener() {},
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

  for (const item of all) {
    assert.equal(item.dataset.screen, 'operations');
    assert.equal(item.hidden, false);
    assert.equal(item.style.display, '');
    assert.equal(item.label.textContent, 'Operations');
    assert.equal(item['aria-label'], 'Operations');
  }
  assert.equal(context.window.__dabbirContextualNavigation.workspace_source, 'global-lexical-first');
});

test('window.workspace remains a compatibility fallback only when no lexical workspace exists', () => {
  const side = navNode('appointments');
  const document = {
    documentElement: { lang: 'en' },
    querySelector(selector) {
      if (selector === '#menuBtn' || selector === '#screen-more .moreGrid' || selector === '#dabbirContextServices') return null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector.includes('appointments')) return side.dataset.screen === 'appointments' ? [side] : [];
      if (selector.includes('operations')) return side.dataset.screen === 'operations' ? [side] : [];
      if (selector === '[data-dabbir-activity-slot="true"]') return side.dataset.dabbirActivitySlot === 'true' ? [side] : [];
      return [];
    },
    addEventListener() {},
    createElement() { throw new Error('UNEXPECTED_CREATE_ELEMENT'); },
  };
  const context = {
    window: { workspace: { business: { business_type: 'store' } } },
    document,
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
});
