import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const appPath = 'api/app.js';
const runtimePath = 'api/dabbir-runtime-fast.js';
const app = fs.readFileSync(appPath, 'utf8');
const runtime = fs.readFileSync(runtimePath, 'utf8');

test('truth visibility files parse', () => {
  for (const path of [appPath, runtimePath]) {
    const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${path}: ${result.stderr || result.stdout}`);
  }
});

test('fast runtime exposes verified tenant read provenance and exact read timestamp', () => {
  assert.match(runtime, /truth_mode:\s*'VERIFIED_TENANT_READS_AND_EXACT_COUNTS'/);
  assert.match(runtime, /state:\s*'VERIFIED_TENANT_READ'/);
  assert.match(runtime, /source:\s*'SUPABASE_RLS_TENANT_DATA'/);
  assert.match(runtime, /read_at:\s*new Date\(\)\.toISOString\(\)/);
  assert.match(runtime, /business_updated_at/);
  assert.match(runtime, /exact_metrics_state/);
  assert.match(runtime, /const DABBIR_FAST_RUNTIME_VERSION = 'fast-v7-timeout-guarded'/);
  assert.match(runtime, /x-dabbir-runtime', DABBIR_FAST_RUNTIME_VERSION/);
  assert.match(runtime, /runtime_version: DABBIR_FAST_RUNTIME_VERSION/);
});

test('fast runtime failures are explicit unverified states with runtime evidence', () => {
  assert.match(runtime, /state:\s*'FAILED_OR_UNVERIFIED'/);
  assert.match(runtime, /truth:\s*\{ state: 'UNVERIFIED', runtime_version: DABBIR_FAST_RUNTIME_VERSION \}/);
  assert.match(runtime, /runtime_version:\s*DABBIR_FAST_RUNTIME_VERSION/);
});

test('owner interface renders a compact verified-data badge', () => {
  assert.match(app, /dabbirTruthBadge/);
  assert.match(app, /بيانات موثقة/);
  assert.match(app, /Verified data/);
  assert.match(app, /SUPABASE_RLS_TENANT_DATA|بيانات النشاط المعزولة/);
  assert.match(app, /workspace\?\.data_truth/);
});

test('owner interface surfaces unverified action state instead of hiding it', () => {
  assert.match(app, /workspace\.last_action_truth=j\.truth\|\|\{state:'UNVERIFIED'\}/);
  assert.match(app, /آخر إجراء يحتاج تحقق/);
  assert.match(app, /Last action needs verification/);
  assert.match(app, /action\.state!=='VERIFIED'/);
});
