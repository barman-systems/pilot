import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const endpoint = fs.readFileSync(new URL('../api/dabbir-ai.js', import.meta.url), 'utf8');
const helper = fs.readFileSync(new URL('../api/_ai-provider-readiness.js', import.meta.url), 'utf8');

test('AI health exposes provider names without exposing credential names or values in the public endpoint', () => {
  assert.match(endpoint, /direct_providers:\s*configuredDirectProviders\(\)/);
  assert.doesNotMatch(endpoint, /GEMINI_API_KEY|GROQ_API_KEY|CLOUDFLARE_API_TOKEN|AI_GATEWAY_API_KEY/);
  assert.match(helper, /'google-gemini'/);
  assert.match(helper, /'groq'/);
  assert.match(helper, /'cloudflare-workers-ai'/);
  assert.doesNotMatch(endpoint, /api_token_value|secret_value|credential_value/i);
});
