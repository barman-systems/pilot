import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('production Node runtime stays on supported LTS line', () => {
  assert.equal(pkg.engines?.node, '22.x');
});
