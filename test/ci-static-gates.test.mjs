import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const ci = await readFile(new URL('.github/workflows/ci.yml', root), 'utf8');
const auditRetry = await readFile(new URL('scripts/audit-prod-retry.mjs', root), 'utf8');
const auditAttestation = JSON.parse(await readFile(new URL('config/production-dependency-audit-attestation.json', root), 'utf8'));

test('CI exposes a repository-wide JavaScript syntax gate', () => {
  assert.match(String(pkg.scripts?.['check:syntax'] || ''), /node --check/);
  assert.match(String(pkg.scripts?.['check:syntax'] || ''), /git ls-files/);
  assert.match(ci, /npm run check:syntax/);
});

test('CI audits production dependency vulnerabilities at high severity with bounded fail-closed retries', () => {
  assert.equal(pkg.scripts?.['audit:prod'], 'node scripts/audit-prod-retry.mjs');
  assert.match(auditRetry, /const MAX_ATTEMPTS = 3;/);
  assert.match(auditRetry, /const ATTEMPT_TIMEOUT_MS = 20000;/);
  assert.match(auditRetry, /SIGTERM/);
  assert.match(auditRetry, /SIGKILL/);
  assert.match(auditRetry, /ETIMEDOUT/);
  assert.match(auditRetry, /['"]audit['"]/);
  assert.match(auditRetry, /['"]--omit=dev['"]/);
  assert.match(auditRetry, /['"]--audit-level=high['"]/);
  assert.match(auditRetry, /429/);
  assert.match(auditRetry, /5\\d\\d/);
  assert.match(auditRetry, /service unavailable/i);
  assert.match(auditRetry, /non-transient result.*refusing to bypass/is);
  assert.match(auditRetry, /attested fallback denied.*failing closed/is);
  assert.match(ci, /npm run audit:prod/);
});

test('transient audit outage fallback is pinned to an already successful unchanged dependency graph', () => {
  assert.equal(auditAttestation.schema_version, 1);
  assert.equal(auditAttestation.audit_level, 'high');
  assert.equal(auditAttestation.package_json_blob, 'aacef4f6e1c2fb8f19bf270cec1ede4bd145e89a');
  assert.equal(auditAttestation.package_lock_blob, 'f52882cf4b34e9fddb7b19fa4c8ffbc7cd0ecf40');
  assert.equal(auditAttestation.source.workflow_run_id, 33837388247);
  assert.equal(auditAttestation.source.workflow_conclusion, 'success');
  assert.match(auditRetry, /gitBlobSha/);
  assert.match(auditRetry, /PACKAGE_JSON_CHANGED/);
  assert.match(auditRetry, /PACKAGE_LOCK_CHANGED/);
  assert.match(auditRetry, /byte-identical to successful audit run/);
});

test('static gates run before the main DABBIR test suite', () => {
  const syntax = ci.indexOf('npm run check:syntax');
  const audit = ci.indexOf('npm run audit:prod');
  const tests = ci.indexOf('npm test');
  assert.ok(syntax >= 0 && audit >= 0 && tests >= 0);
  assert.ok(syntax < tests && audit < tests);
});
