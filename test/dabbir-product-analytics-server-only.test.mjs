import test from 'node:test';
import assert from 'node:assert/strict';
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
