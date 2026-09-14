import test from 'node:test';
import assert from 'node:assert/strict';

const GATEWAY_MODEL = 'alibaba/qwen3.7-flash';

test('Qwen3.7 benchmark uses the verified Vercel AI Gateway slug', () => {
  assert.equal(GATEWAY_MODEL, 'alibaba/qwen3.7-flash');
});

test('Qwen3.7 stays outside Production routing until benchmark promotion', () => {
  const productionFallbackModels = ['anthropic/claude-sonnet-4.6','google/gemini-3-flash','openai/gpt-5.4-nano'];
  assert.equal(productionFallbackModels.includes(GATEWAY_MODEL), false);
});
