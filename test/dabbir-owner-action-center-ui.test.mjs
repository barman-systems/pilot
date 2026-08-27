import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/owner-action-center-ui.js';

function renderClient() {
  const headers = new Map();
  let statusCode = 200;
  let body = '';
  const res = {
    status(code) { statusCode = code; return this; },
    setHeader(name, value) { headers.set(String(name).toLowerCase(), String(value)); return this; },
    send(value) { body = String(value ?? ''); return this; },
    end(value = '') { body = String(value ?? ''); return this; },
  };
  handler({ method: 'GET' }, res);
  return { statusCode, headers, body };
}

test('owner action center defaults to the top three priorities and keeps progressive disclosure', () => {
  const result = renderClient();
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers.get('x-dabbir-owner-action-center-ui'), 'v2');
  assert.match(result.body, /const DEFAULT_VISIBLE=3;/);
  assert.match(result.body, /const MAX_VISIBLE=8;/);
  assert.match(result.body, /visibleLimit=expanded\?MAX_VISIBLE:DEFAULT_VISIBLE/);
  assert.match(result.body, /عرض بقية الأولويات/);
  assert.match(result.body, /Show top 3 only/);
  assert.match(result.body, /aria-expanded/);
  assert.match(result.body, /owner-action-center-v2/);
});

test('generated owner action center client is valid JavaScript', () => {
  const { body } = renderClient();
  assert.doesNotThrow(() => new Function(body));
});
