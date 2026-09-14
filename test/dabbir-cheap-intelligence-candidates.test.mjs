import test from 'node:test';
import assert from 'node:assert/strict';

// Contract-only freeze for the first benchmark wave. This test intentionally does
// not add candidates to Production routing. It prevents accidental model promotion
// before a measured benchmark result exists.
const CANDIDATES = Object.freeze([
  Object.freeze({ id: 'qwen37-flash', provider: 'alibaba-model-studio', productionEligible: false }),
  Object.freeze({ id: 'ternary-bonsai-27b', provider: 'together-ai', productionEligible: false }),
]);

test('cheap intelligence candidates are benchmark-only', () => {
  assert.equal(CANDIDATES.length, 2);
  for (const candidate of CANDIDATES) {
    assert.equal(candidate.productionEligible, false);
    assert.match(candidate.id, /^[a-z0-9-]+$/);
  }
});
