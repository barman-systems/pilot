import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const core = fs.readFileSync(new URL('../api/_ai-core.js', import.meta.url), 'utf8');

test('Cloudflare account ID is deterministic across Production and Preview builds', () => {
  assert.equal(vercel.env?.CLOUDFLARE_ACCOUNT_ID, '5d3fa7dfe0b6a38bb4f2b526279fb380');
});

test('Cloudflare remains a direct fallback before Vercel Gateway and still requires the secret token', () => {
  assert.match(core, /CLOUDFLARE_API_TOKEN/);
  assert.match(core, /CLOUDFLARE_ACCOUNT_ID/);
  assert.match(core, /cloudflare-workers-ai/);
  assert.match(core, /FREE_TIER_FIRST/);
});
