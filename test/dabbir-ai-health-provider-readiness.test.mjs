import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../api/dabbir-ai.js', import.meta.url), 'utf8');

test('AI health exposes provider names without exposing credential values', () => {
  assert.match(source, /direct_providers:\s*configuredDirectProviders\(\)/);
  assert.match(source, /'google-gemini'/);
  assert.match(source, /'groq'/);
  assert.match(source, /'cloudflare-workers-ai'/);
  assert.doesNotMatch(source, /api_token_value|secret_value|credential_value/i);
});
