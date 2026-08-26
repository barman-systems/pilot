import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function readJson(path) {
  return JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
}

test('PILOT product contract requires Arabic and English everywhere', async () => {
  const contract = await readJson('config/i18n-contract.json');
  assert.equal(contract.status, 'MANDATORY');
  assert.deepEqual(contract.supported_locales, ['ar', 'en']);
  assert.equal(contract.direction.ar, 'rtl');
  assert.equal(contract.direction.en, 'ltr');
  assert.equal(contract.acceptance_rules.no_single_language_ui, true);
  assert.equal(contract.acceptance_rules.all_new_features_require_both_locales_before_release, true);
  assert.equal(contract.conversation_translation.one_tap_full_conversation, true);
  assert.equal(contract.conversation_translation.single_message, true);
  assert.equal(contract.conversation_translation.preserve_original, true);
});

test('Arabic and English locale catalogs have identical non-empty keys', async () => {
  const ar = await readJson('locales/ar.json');
  const en = await readJson('locales/en.json');
  assert.deepEqual(Object.keys(ar).sort(), Object.keys(en).sort());
  for (const key of Object.keys(ar)) {
    assert.equal(typeof ar[key], 'string', `Arabic value for ${key} must be a string`);
    assert.equal(typeof en[key], 'string', `English value for ${key} must be a string`);
    assert.ok(ar[key].trim(), `Arabic value for ${key} must not be empty`);
    assert.ok(en[key].trim(), `English value for ${key} must not be empty`);
  }
});

test('translation preview exposes Arabic/English switching and preserves original text', async () => {
  const html = await readFile(new URL('../translation-preview.html', import.meta.url), 'utf8');
  assert.match(html, /id="ar"/);
  assert.match(html, /id="en"/);
  assert.match(html, /document\.documentElement\.dir=l==='ar'\?'rtl':'ltr'/);
  assert.match(html, /original/);
  assert.match(html, /\/api\/translate/);
});
