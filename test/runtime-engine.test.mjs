import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(fs.readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));

const AUTHORITATIVE_NODE_RUNTIME = '24.x';

test('production Node runtime matches the authoritative Vercel runtime line', () => {
  assert.equal(pkg.engines?.node, AUTHORITATIVE_NODE_RUNTIME);
  assert.equal(lock.packages?.['']?.engines?.node, AUTHORITATIVE_NODE_RUNTIME);
  assert.equal(pkg.engines?.node, lock.packages?.['']?.engines?.node);
});
