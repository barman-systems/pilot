import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const requiredScreens = [
  'dashboard',
  'conversations',
  'appointments',
  'customers',
  'tasks',
  'automations',
  'analytics',
  'integrations',
  'notifications',
  'settings',
  'help'
];

test('main PILOT preview is full product navigation, not a partial feature demo', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  for (const screen of requiredScreens) {
    assert.match(html, new RegExp(`id="screen-${screen}"`), `missing ${screen} screen`);
  }
  assert.match(html, /id="arBtn"/);
  assert.match(html, /id="enBtn"/);
  assert.match(html, /document\.documentElement\.dir=lang==='ar'\?'rtl':'ltr'/);
  assert.match(html, /\/api\/translate/);
  assert.match(html, /conversation\.show_original/);
});

test('full preview navigation labels exist in both locale catalogs', async () => {
  const ar = JSON.parse(await readFile(new URL('../locales/ar.json', import.meta.url), 'utf8'));
  const en = JSON.parse(await readFile(new URL('../locales/en.json', import.meta.url), 'utf8'));
  for (const screen of requiredScreens) {
    const key = `nav.${screen}`;
    assert.ok(ar[key]?.trim(), `missing Arabic ${key}`);
    assert.ok(en[key]?.trim(), `missing English ${key}`);
  }
});
