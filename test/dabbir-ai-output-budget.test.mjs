import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../api/_ai-core.js', import.meta.url), 'utf8');

test('AI has separate explicitly bounded semantic and customer reply budgets', () => {
  assert.match(source,/semanticEnabled=!!spec/,'all structured semantic profiles, including V3, must share the bounded semantic path');
  const match = source.match(/max_tokens:\s*semanticEnabled\s*\?\s*(\d+)\s*:\s*(\d+)/);
  assert.ok(match, 'max_tokens must remain explicitly bounded');
  assert.equal(Number(match[1]),1600,'structured interpretation has bounded reasoning and JSON headroom');
  assert.equal(Number(match[2]),320,'ordinary reply budget must not increase');
});
