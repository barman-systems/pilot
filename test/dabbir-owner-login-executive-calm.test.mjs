import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('owner OTP login uses Executive Calm and rejects the legacy neon login identity', async () => {
  const source = await read('api/owner-login.js');
  assert.match(source, /data-design-system="executive-calm-v1"/);
  assert.match(source, /--brand:#536dfe/);
  assert.match(source, /background:var\(--brand\)/);
  assert.match(source, /x-dabbir-design-system','executive-calm-v1'/);
  assert.match(source, /مركز إدارة النشاط/);
  assert.doesNotMatch(source, /#d7ff5f/i);
  assert.doesNotMatch(source, /Platform Control Center/);
  assert.doesNotMatch(source, /radial-gradient/);
});

test('owner OTP security and navigation behavior remain unchanged by the visual repair', async () => {
  const source = await read('api/owner-login.js');
  assert.match(source, /\/api\/auth\/owner-otp/);
  assert.match(source, /autocomplete="one-time-code"/);
  assert.match(source, /pattern="\[0-9\]\{6\}"/);
  assert.match(source, /location\.replace\('\/owner-dashboard'\)/);
  assert.doesNotMatch(source, /type="password"/);
});
