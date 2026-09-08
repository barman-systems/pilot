import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../api/dabbir-market-demo.js';
import preview from '../api/dabbir-market-preview.js';

function response() {
  return {
    statusCode: 200, headers: {}, body: '',
    setHeader(name, value) { this.headers[name] = value; },
    end(value = '') { this.body = value; },
  };
}

test('retired demo rejects all methods before accessing a request body', () => {
  for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const res = response();
    const req = { method, get body() { assert.fail('retired demo must not read customer input'); } };
    handler(req, res);
    assert.equal(res.statusCode, 410);
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal(res.body, method === 'HEAD' ? '' : JSON.stringify({ ok: false, error: 'DEMO_RETIRED' }));
  }
});

test('old demo page redirects safely to login and rejects writes', () => {
  for (const method of ['GET', 'HEAD', 'POST']) {
    const res = response();
    preview({ method, url: '/try?next=https://attacker.invalid' }, res);
    assert.equal(res.statusCode, method === 'POST' ? 405 : 303);
    assert.equal(res.headers.location, method === 'POST' ? undefined : '/');
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal(res.body, '');
  }
});
