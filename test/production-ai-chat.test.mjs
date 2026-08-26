import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync(new URL('../api/pilot-ai.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../api/app.js', import.meta.url), 'utf8');
const vercel = fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');

test('PILOT AI endpoint supports production synthetic mode without side effects', () => {
  assert.doesNotMatch(api, /preview_only_ai/);
  assert.match(api, /PRODUCTION_PILOT/);
  assert.match(api, /synthetic_mode_required/);
  assert.match(api, /data_mode: 'SYNTHETIC_ONLY'/);
  assert.match(api, /external_side_effects: false/);
});

test('unified conversation is rendered with a real PILOT AI request and reply', () => {
  assert.match(app, /fetch\('\/api\/pilot-ai'/);
  assert.match(app, /synthetic:true,project:'pilot_clinics'/);
  assert.match(app, /j\.reply/);
  assert.match(app, /aiGenerated:true/);
  assert.match(app, /syntheticCustomer:true/);
});

test('canonical root cannot fall back to the static non-AI composer', () => {
  const config = JSON.parse(vercel);
  assert.ok(config.redirects.some(rule => rule.source === '/' && rule.destination === '/api/app'));
  assert.ok(config.rewrites.some(rule => rule.source === '/' && rule.destination === '/api/app'));
  assert.equal(config.functions['api/app.js'].includeFiles, 'index.html');
});
