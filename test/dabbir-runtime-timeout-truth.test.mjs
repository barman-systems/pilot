import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const runtime = fs.readFileSync('api/dabbir-runtime-fast.js', 'utf8');

test('fast runtime has one timeout-aware version authority', () => {
  assert.match(runtime, /const DABBIR_FAST_RUNTIME_VERSION = 'fast-v7-timeout-guarded'/);
  assert.match(runtime, /setHeader\('x-dabbir-runtime', DABBIR_FAST_RUNTIME_VERSION\)/);
  assert.match(runtime, /runtime_version: DABBIR_FAST_RUNTIME_VERSION/);
  assert.doesNotMatch(runtime, /x-dabbir-runtime', 'fast-v6-exact-metrics'/);
});

test('Supabase reads are individually bounded and required reads fail the response fast', () => {
  assert.match(runtime, /const DB_TIMEOUT_MS = 10_000/);
  assert.match(runtime, /new AbortController\(\)/);
  assert.match(runtime, /supabaseRest\(path, token, \{ signal \}\)/);
  assert.match(runtime, /prefer: 'count=exact' \}, signal/);
  assert.match(runtime, /await Promise\.all\(/);
  assert.match(runtime, /intentionally fails the whole request if any required read times out or fails/);
  assert.match(runtime, /\[400, 401, 403, 404, 409, 413, 429, 502, 503, 504\]/);
});

test('runtime documentation cannot claim a single required query fails in isolation', () => {
  assert.doesNotMatch(runtime, /يفشل هو فقط بعد DB_TIMEOUT_MS/);
  assert.doesNotMatch(runtime, /كل استعلام يفشل بمفرده عند التعليق بدل تعليق الطلب كامل/);
});
