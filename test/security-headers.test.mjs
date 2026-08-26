import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('web deployment defines baseline hardening headers', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const headers = Object.fromEntries((config.headers?.[0]?.headers || []).map(h => [h.key.toLowerCase(), h.value]));
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.equal(headers['referrer-policy'], 'no-referrer');
  assert.match(headers['permissions-policy'] || '', /camera=\(\)/);
  assert.match(headers['content-security-policy'] || '', /frame-ancestors 'none'/);
  assert.match(headers['content-security-policy'] || '', /object-src 'none'/);
});
