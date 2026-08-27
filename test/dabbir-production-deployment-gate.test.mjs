import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const ignore = fs.readFileSync(new URL('../vercel-ignore-if-unaffected.sh', import.meta.url), 'utf8');

test('every Vercel build must execute the full DABBIR test suite', () => {
  assert.equal(pkg.scripts?.['vercel-build'], 'npm test');
  assert.equal(pkg.scripts?.test, 'node --test test/*.test.mjs');
});

test('runtime and package changes cannot be skipped by the Vercel ignore gate', () => {
  assert.match(ignore, /Runtime or unknown path changed/);
  assert.doesNotMatch(ignore, /package\.json\|/);
  assert.doesNotMatch(ignore, /package-lock\.json\|/);
});
