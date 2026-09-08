import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../api/_ai-core.js', import.meta.url), 'utf8');

test('AI output budget is large enough for structured WhatsApp planner replies', () => {
  const match = source.match(/max_tokens:\s*(\d+)/);
  assert.ok(match, 'max_tokens must remain explicitly bounded');
  assert.ok(Number(match[1]) >= 256, `max_tokens=${match[1]} is too small for planner JSON`);
});
