import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../api/_whatsapp-embedded-core.js', import.meta.url), 'utf8');

function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing start marker ${startMarker}`);
  assert.ok(end > start, `missing end marker ${endMarker}`);
  return source.slice(start, end);
}

test('legacy Meta access-token discovery uses Authorization header, never URL transport', () => {
  const discovery = between(
    'async function discoverAppIdFromExistingToken(config)',
    'export async function resolveEmbeddedPlatformConfig()',
  );

  assert.doesNotMatch(discovery, /searchParams\.set\(['"]access_token['"]/);
  assert.doesNotMatch(discovery, /[?&]access_token=/);
  assert.match(discovery, /authorization:\s*`Bearer \$\{token\}`/);
  assert.match(discovery, /setTimeout\(\(\) => controller\.abort\(\),\s*5000\)/);
  assert.match(discovery, /cache:\s*['"]no-store['"]/);
  assert.match(discovery, /\^\[0-9\]\{5,40\}\$/);
});

test('provider-required OAuth client secret remains server-only and is not returned or logged', () => {
  const exchange = between(
    'export async function exchangeEmbeddedCode(config, code)',
    'export async function verifyEmbeddedAssets(config, token, wabaId, phoneNumberId)',
  );

  // Meta's official Tech Provider sample documents client_secret as a required
  // query parameter for this server-side token exchange. Keep the provider
  // contract isolated to this backend function and never expose the URL/secret.
  assert.match(exchange, /searchParams\.set\(['"]client_secret['"],\s*config\.appSecret\)/);
  assert.doesNotMatch(exchange, /console\.(?:log|info|warn|error)/);
  assert.doesNotMatch(exchange, /return\s+\{[^}]*appSecret/s);
  assert.doesNotMatch(exchange, /return\s+url/);
  assert.match(exchange, /setTimeout\(\(\) => controller\.abort\(\),\s*8000\)/);
  assert.match(exchange, /cache:\s*['"]no-store['"]/);
});
