import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanEvidencePaths } from '../scripts/dabbir-evidence-secret-gate.mjs';

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dabbir-evidence-gate-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('clean DABBIR evidence telemetry passes without treating token counters as credentials', async t => {
  const dir = await fixture(t);
  await fs.writeFile(path.join(dir, 'report.json'), JSON.stringify({
    verdict: 'PASS',
    usage: { inputTokens: 120, outputTokens: 44 },
    evidence: { mfa_secret_omitted: true, synthetic_identity: true },
  }));
  const result = await scanEvidencePaths([dir]);
  assert.equal(result.finding_count, 0);
  assert.equal(result.scanned_files, 1);
});

test('sensitive JSON fields fail even when the value is redacted', async t => {
  const dir = await fixture(t);
  await fs.writeFile(path.join(dir, 'report.json'), JSON.stringify({ password: '[REDACTED]' }));
  const result = await scanEvidencePaths([dir]);
  assert.ok(result.findings.some(item => item.detector === 'forbidden_json_key:password'));
});

test('provider-shaped credentials are detected without persisting a literal credential in source', async t => {
  const dir = await fixture(t);
  const synthetic = 'ghp_' + 'A'.repeat(40);
  await fs.writeFile(path.join(dir, 'evidence.bin'), Buffer.from(`metadata=${synthetic}`));
  const result = await scanEvidencePaths([dir]);
  assert.ok(result.findings.some(item => item.detector === 'github_token'));
  assert.ok(!JSON.stringify(result.findings).includes(synthetic));
});

test('QA passwords and OTP enrollment URIs cannot enter an artifact', async t => {
  const dir = await fixture(t);
  await fs.writeFile(path.join(dir, 'qa.txt'), 'password=Dabbir-QA-' + 'X'.repeat(16) + '\notpauth://totp/example');
  const result = await scanEvidencePaths([dir]);
  assert.ok(result.findings.some(item => item.detector === 'qa_password'));
  assert.ok(result.findings.some(item => item.detector === 'otp_uri'));
});

test('missing evidence paths fail closed', async t => {
  const dir = await fixture(t);
  const result = await scanEvidencePaths([path.join(dir, 'missing.json')]);
  assert.ok(result.findings.some(item => item.detector === 'missing_path'));
});
