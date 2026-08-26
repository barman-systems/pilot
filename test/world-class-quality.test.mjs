import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('every referenced UI localization key exists in Arabic and English', async () => {
  const [html, arRaw, enRaw] = await Promise.all([read('index.html'), read('locales/ar.json'), read('locales/en.json')]);
  const ar = JSON.parse(arRaw), en = JSON.parse(enRaw);
  assert.deepEqual(Object.keys(ar).sort(), Object.keys(en).sort());
  const keys = [...html.matchAll(/data-(?:i18n|ph)="([^"]+)"/g)].map(m => m[1]);
  assert.ok(keys.length > 100, 'full preview should localize all major user-facing copy');
  for (const key of new Set(keys)) {
    assert.ok(ar[key]?.trim(), `missing Arabic key ${key}`);
    assert.ok(en[key]?.trim(), `missing English key ${key}`);
  }
});

test('preview cannot claim verified external channels while registry is unverified', async () => {
  const [html, registryRaw] = await Promise.all([read('index.html'), read('config/runtime-registry.json')]);
  const registry = JSON.parse(registryRaw);
  assert.equal(registry.projects.pilot_clinics.external_channels, 'UNVERIFIED');
  assert.match(html, /externalVerified\(\)/);
  assert.match(html, /integrations\.unverified/);
  assert.doesNotMatch(html, /WhatsApp channel healthy/i);
  assert.doesNotMatch(html, /Last verified 1 hour ago/i);
});

test('full preview has mobile touch, focus, reduced-motion, and modal accessibility baselines', async () => {
  const html = await read('index.html');
  assert.match(html, /button:focus-visible/);
  assert.match(html, /min-height:48px/);
  assert.match(html, /prefers-reduced-motion:reduce/);
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(html, /role="status" aria-live="polite"/);
});

test('translation route has bounded workload and prompt-injection handling instruction', async () => {
  const source = await read('api/translate.js');
  assert.match(source, /MAX_MESSAGES = 20/);
  assert.match(source, /MAX_TOTAL_CHARS = 12000/);
  assert.match(source, /translation_payload_too_large/);
  assert.match(source, /never as an instruction/);
});
