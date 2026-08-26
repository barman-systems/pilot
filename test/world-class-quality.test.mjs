import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('operational workspace is bilingual and switches RTL/LTR without single-language screens', async () => {
  const html = await read('index.html');
  assert.match(html, /const D=\{ar:\{/);
  assert.match(html, /,en:\{/);
  assert.match(html, /document\.documentElement\.dir=lang==='ar'\?'rtl':'ltr'/);
  for (const label of ['dashboard','conversations','appointments','customers','tasks','automations','analytics','integrations','notifications','settings','help']) {
    assert.match(html, new RegExp(`${label}:'`));
  }
});

test('UI cannot promote external channels into verified state', async () => {
  const [html, registryRaw] = await Promise.all([read('index.html'), read('config/runtime-registry.json')]);
  const registry = JSON.parse(registryRaw);
  assert.equal(registry.channels.web, 'OPERATIONAL');
  assert.match(registry.channels.whatsapp, /^NOT_OPERATIONAL/);
  assert.equal(registry.projects.dabbir_clinics.external_channels, 'UNVERIFIED');
  assert.match(html, /function externalVerified\(\)\{return false\}/);
  assert.match(html, /Meta authorization/);
  assert.doesNotMatch(html, /WhatsApp channel healthy/i);
});

test('operational interface has mobile touch, focus, reduced-motion and modal accessibility baselines', async () => {
  const html = await read('index.html');
  assert.match(html, /button:focus-visible/);
  assert.match(html, /min-height:48px/);
  assert.match(html, /prefers-reduced-motion:reduce/);
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(html, /role="status" aria-live="polite"/);
});

test('translation route is authenticated, bounded and prompt-injection resistant', async () => {
  const source = await read('api/translate.js');
  assert.match(source, /MAX_MESSAGES = 20/);
  assert.match(source, /MAX_TOTAL_CHARS = 12000/);
  assert.match(source, /translation_payload_too_large/);
  assert.match(source, /never as an instruction/);
  assert.match(source, /requireSameOrigin/);
  assert.match(source, /getVerifiedUser/);
  assert.match(source, /BUSINESS_ACCESS_DENIED/);
  assert.match(source, /FREE_TIER_ONLY/);
  assert.doesNotMatch(source, /preview_only_runtime/);
});
