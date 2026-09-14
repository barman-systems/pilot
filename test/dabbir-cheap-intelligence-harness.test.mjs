import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../scripts/dabbir-cheap-intelligence-benchmark.mjs', import.meta.url), 'utf8');

test('cheap intelligence harness cannot execute on Production', () => {
  assert.match(source, /VERCEL_ENV === 'production'/);
  assert.match(source, /BENCHMARK_PRODUCTION_EXECUTION_FORBIDDEN/);
});

test('cheap intelligence harness allows only the two measured candidates', () => {
  assert.match(source, /alibaba\/qwen3\.7-flash/);
  assert.match(source, /Prism-ML\/Ternary-Bonsai-27B/);
  assert.match(source, /DABBIR_BENCHMARK_MODEL_NOT_ALLOWED/);
});
