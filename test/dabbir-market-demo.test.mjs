import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import preview from '../api/dabbir-market-preview.js';

function response() {
  return {
    statusCode: 200, headers: {}, body: '',
    setHeader(name, value) { this.headers[name] = value; },
    end(value = '') { this.body = value; },
  };
}

test('retired executable demo endpoint is removed from the repository', () => {
  assert.equal(fs.existsSync(new URL('../api/dabbir-market-demo.js', import.meta.url)), false);
});

test('old demo page still redirects safely to login and rejects writes', () => {
  for (const method of ['GET', 'HEAD', 'POST']) {
    const res = response();
    preview({ method, url: '/try?next=https://attacker.invalid' }, res);
    assert.equal(res.statusCode, method === 'POST' ? 405 : 303);
    assert.equal(res.headers.location, method === 'POST' ? undefined : '/');
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal(res.body, '');
  }
});
