import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import handler from '../api/product-analytics.js';

function invoke(method = 'POST') {
  const headers = new Map();
  let body = null;
  const req = { method, body: { event: 'signup_completed', anonymous_id: 'spoofed-client' } };
  const res = {
    statusCode: 0,
    setHeader(key, value) { headers.set(String(key).toLowerCase(), value); },
    end(value) { body = JSON.parse(value); },
  };
  handler(req, res);
  return { status: res.statusCode, headers, body };
}

test('legacy product analytics endpoint rejects public event ingestion', () => {
  const result = invoke('POST');
  assert.equal(result.status, 410);
  assert.deepEqual(result.body, { ok: false, error: 'ANALYTICS_SERVER_ONLY' });
  assert.equal(result.headers.get('cache-control'), 'no-store');
});

for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
  test(`legacy product analytics endpoint is closed for ${method}`, () => {
    const result = invoke(method);
    assert.equal(result.status, 410);
    assert.equal(result.body.error, 'ANALYTICS_SERVER_ONLY');
  });
}

test('PostHog outbox recovers durable events when pg_net volatile state disappears', () => {
  const sql = fs.readFileSync(new URL('../supabase/migrations/20260915020000_dabbir_posthog_product_outbox_v1.sql', import.meta.url), 'utf8');
  assert.match(sql, /posthog_enqueued_at\s*<\s*now\(\)-interval\s*'15 minutes'/i);
  assert.match(sql, /not exists\s*\(select 1 from net\.http_request_queue/i);
  assert.match(sql, /not exists\s*\(select 1 from net\._http_response/i);
  assert.match(sql, /PG_NET_RESPONSE_MISSING_RETRY/);
  assert.match(sql, /'uuid',v_row\.id::text/);
});
