import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import customerNumberHandler from '../api/dabbir-customer-number.js';

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(key, value) { this.headers[String(key).toLowerCase()] = value; },
    end(body = '') { this.body = String(body); },
  };
}

test('customer-number migration keeps UUID canonical and DAB number immutable', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260827142516_dabbir_customer_number_v1.sql', import.meta.url), 'utf8');
  assert.match(sql, /user_id uuid primary key references auth\.users\(id\)/i);
  assert.match(sql, /unique \(customer_no\)/i);
  assert.match(sql, /\^DAB-\[0-9\]\{6,\}\$/);
  assert.match(sql, /DABBIR_CUSTOMER_NUMBER_IMMUTABLE/);
  assert.match(sql, /user_id = \(select auth\.uid\(\)\)/i);
});

test('DABBIR signup metadata provisions a customer number without making signup depend on it', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260827143332_dabbir_customer_number_signup_trigger_v1.sql', import.meta.url), 'utf8');
  assert.match(sql, /raw_user_meta_data\s*->>\s*'product'/i);
  assert.match(sql, /= 'DABBIR'/);
  assert.match(sql, /after insert or update of raw_user_meta_data on auth\.users/i);
  assert.match(sql, /exception\s+when others/i);
  assert.match(sql, /PROVISIONING_DEFERRED/);
});

test('customer-number endpoint returns only the authenticated user account number', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });

  const userId = '11111111-1111-4111-8111-111111111111';
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: userId, email: 'owner@example.com', aud: 'authenticated' }), { status: 200 });
    }
    if (String(url).includes('/rest/v1/dabbir_user_accounts')) {
      assert.match(String(url), new RegExp(`user_id=eq\\.${userId}`));
      return new Response(JSON.stringify([{ customer_no: 'DAB-100001', created_at: '2026-08-27T00:00:00Z' }]), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const req = { method: 'GET', headers: { cookie: '__Host-dabbir_access=test-access-token' } };
  const res = responseRecorder();
  await customerNumberHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), {
    ok: true,
    customer_no: 'DAB-100001',
    created_at: '2026-08-27T00:00:00Z',
  });
  assert.equal(calls.length, 2);
});

test('customer-number UI is injected into the authoritative recovery shell', async () => {
  const shell = await readFile(new URL('../api/app-recovery.js', import.meta.url), 'utf8');
  const ui = await readFile(new URL('../api/dabbir-customer-number-ui.js', import.meta.url), 'utf8');
  assert.match(shell, /\/api\/dabbir-customer-number-ui/);
  assert.match(ui, /رقم العميل/);
  assert.match(ui, /Customer number/);
  assert.match(ui, /\/api\/dabbir-customer-number/);
  assert.match(ui, /data-dabbir-customer-number/);
});
