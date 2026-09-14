import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { existsSync } from 'node:fs';

async function readJson(path) {
  return JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
}

test('DABBIR product contract requires Arabic and English everywhere', async () => {
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

test('live shell Arabic and English dictionaries have identical non-empty keys', async () => {
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const source=html.slice(html.indexOf('const D=')+8,html.indexOf('\nlet lang='));
  const {ar,en}=vm.runInNewContext('('+source.replace(/;\s*$/, '')+')');
  for(const file of ['locales/ar.json','locales/en.json'])assert.equal(existsSync(new URL('../'+file,import.meta.url)),false,'unused catalog must not be revived');
  function equivalent(ar,en,prefix=''){
    assert.deepEqual(Object.keys(ar).sort(),Object.keys(en).sort(),prefix);
    for(const key of Object.keys(ar)){
      const name=prefix+key;
      if(ar[key]&&typeof ar[key]==='object'){
        assert.equal(typeof en[key],'object',name);
        equivalent(ar[key],en[key],name+'.');
      }else{
        assert.equal(typeof ar[key],'string',`Arabic value for ${name} must be a string`);
        assert.equal(typeof en[key],'string',`English value for ${name} must be a string`);
        assert.ok(ar[key].trim(),`Arabic value for ${name} must not be empty`);
        assert.ok(en[key].trim(),`English value for ${name} must not be empty`);
      }
    }
  }
  equivalent(ar,en);
});

test('translation preview exposes Arabic/English switching and preserves original text', async () => {
  const html = await readFile(new URL('../translation-preview.html', import.meta.url), 'utf8');
  assert.match(html, /id="ar"/);
  assert.match(html, /id="en"/);
  assert.match(html, /document\.documentElement\.dir=l==='ar'\?'rtl':'ltr'/);
  assert.match(html, /original/);
  assert.match(html, /\/api\/translate/);
});
