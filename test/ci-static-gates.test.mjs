import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const ci = await readFile(new URL('.github/workflows/ci.yml', root), 'utf8');
const auditRetry = await readFile(new URL('scripts/audit-prod-retry.mjs', root), 'utf8');

test('CI exposes a repository-wide JavaScript syntax gate', () => {
  assert.match(String(pkg.scripts?.['check:syntax'] || ''), /node --check/);
  assert.match(String(pkg.scripts?.['check:syntax'] || ''), /git ls-files/);
  assert.match(ci, /npm run check:syntax/);
});

test('CI audits production dependency vulnerabilities at high severity with bounded fail-closed retries', () => {
  assert.equal(pkg.scripts?.['audit:prod'], 'node scripts/audit-prod-retry.mjs');
  assert.match(auditRetry, /const MAX_ATTEMPTS = 3;/);
  assert.match(auditRetry, /['"]audit['"]/);
  assert.match(auditRetry, /['"]--omit=dev['"]/);
  assert.match(auditRetry, /['"]--audit-level=high['"]/);
  assert.match(auditRetry, /429/);
  assert.match(auditRetry, /5\\d\\d/);
  assert.match(auditRetry, /service unavailable/i);
  assert.match(auditRetry, /non-transient result.*refusing to bypass/is);
  assert.match(auditRetry, /remained unavailable.*failing closed/is);
  assert.match(ci, /npm run audit:prod/);
});

test('static gates run before the main DABBIR test suite', () => {
  const syntax = ci.indexOf('npm run check:syntax');
  const audit = ci.indexOf('npm run audit:prod');
  const tests = ci.indexOf('npm test');
  assert.ok(syntax >= 0 && audit >= 0 && tests >= 0);
  assert.ok(syntax < tests && audit < tests);
});
