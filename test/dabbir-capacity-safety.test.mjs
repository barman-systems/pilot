import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCTION_CAPACITY_ACK,
  assertCapacityLoadAllowed,
  classifyCapacityTarget,
} from './dabbir-capacity-safety.mjs';

test('known production origin is blocked without explicit acknowledgement', () => {
  assert.throws(
    () => assertCapacityLoadAllowed({ origin: 'https://pilot-taupe.vercel.app' }),
    /PRODUCTION_CAPACITY_LOAD_REQUIRES_EXPLICIT_ACK/,
  );
});

test('caller cannot relabel known production as staging', () => {
  assert.equal(
    classifyCapacityTarget('https://pilot-taupe.vercel.app', 'staging'),
    'production',
  );
  assert.throws(
    () => assertCapacityLoadAllowed({
      origin: 'https://pilot-taupe.vercel.app',
      declaredTarget: 'staging',
    }),
    /PRODUCTION_CAPACITY_LOAD_REQUIRES_EXPLICIT_ACK/,
  );
});

test('production load is allowed only with the exact acknowledgement', () => {
  assert.deepEqual(
    assertCapacityLoadAllowed({
      origin: 'https://pilot-taupe.vercel.app',
      ack: PRODUCTION_CAPACITY_ACK,
    }),
    { target: 'production', production_acknowledged: true },
  );
});

test('unknown external origin requires an explicit non-production target', () => {
  assert.throws(
    () => assertCapacityLoadAllowed({ origin: 'https://capacity.example.test' }),
    /CAPACITY_TARGET_MUST_BE_EXPLICIT_FOR_UNKNOWN_ORIGIN/,
  );
});

test('explicit staging target is allowed for a non-production origin', () => {
  assert.deepEqual(
    assertCapacityLoadAllowed({
      origin: 'https://capacity.example.test',
      declaredTarget: 'staging',
    }),
    { target: 'staging', production_acknowledged: false },
  );
});
