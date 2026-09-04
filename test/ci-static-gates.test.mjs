import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const ci = await readFile(new URL('.github/workflows/ci.yml', root), 'utf8');

test('CI exposes a repository-wide JavaScript syntax gate', () => {
  assert.match(String(pkg.scripts?.['check:syntax'] || ''), /node --check/);
  assert.match(String(pkg.scripts?.['check:syntax'] || ''), /git ls-files/);
  assert.match(ci, /npm run check:syntax/);
});

test('CI audits production dependency vulnerabilities at high severity', () => {
  assert.equal(pkg.scripts?.['audit:prod'], 'npm audit --omit=dev --audit-level=high');
  assert.match(ci, /npm run audit:prod/);
});

test('static gates run before the main DABBIR test suite', () => {
  const syntax = ci.indexOf('npm run check:syntax');
  const audit = ci.indexOf('npm run audit:prod');
  const tests = ci.indexOf('npm test');
  assert.ok(syntax >= 0 && audit >= 0 && tests >= 0);
  assert.ok(syntax < tests && audit < tests);
});
