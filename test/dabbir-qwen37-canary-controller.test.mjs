import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const scriptUrl=new URL('../scripts/dabbir-qwen37-canary-control.sh',import.meta.url);
const workflowUrl=new URL('../.github/workflows/dabbir-qwen37-canary-activation.yml',import.meta.url);
const source=fs.readFileSync(scriptUrl,'utf8');
const workflow=fs.readFileSync(workflowUrl,'utf8');

test('Qwen3.7 Production controller is valid Bash before merge',()=>{
  execFileSync('bash',['-n',scriptUrl.pathname],{stdio:'pipe'});
});

test('activation establishes exact-code OFF rollback before enabling one percent',()=>{
  const safeMarker=source.indexOf('QWEN37_CANARY_SAFE_OFF_DEPLOYMENT');
  const enableCall=source.indexOf('upsert_env 1 1');
  const safeVerify=source.indexOf('verify_runtime false 0 "$safe_id" "$GITHUB_SHA"');
  assert.ok(safeVerify>=0);
  assert.ok(safeMarker>safeVerify);
  assert.ok(enableCall>safeMarker);
  assert.match(source,/rollback_id="\$safe_id"/);
  assert.match(source,/verify_runtime true 1 "\$active_id" "\$GITHUB_SHA"/);
});

test('activation rollback disables future deployments and restores the OFF deployment',()=>{
  assert.match(source,/QWEN37_CANARY_ACTIVATION_ROLLBACK/);
  assert.match(source,/upsert_env 0 0/);
  assert.match(source,/promote_rollback "\$rollback_id"/);
  assert.match(source,/verify_runtime false 0 "\$rollback_id"/);
  assert.match(source,/\/promote\/\$\{target\}/);
  assert.match(source,/\/rollback\/\$\{target\}/);
});

test('controller verifies exact deployment, runtime readiness, model and one-percent state',()=>{
  for(const token of [
    'meta.githubCommitSha==$sha',
    '/api/release-evidence',
    '/api/dabbir-qwen37-canary-readiness',
    "alibaba/qwen3.7-flash",
    'RUNTIME_SHA_MISMATCH',
    'RUNTIME_ENABLED_MISMATCH',
    'RUNTIME_PERCENT_MISMATCH',
  ])assert.ok(source.includes(token),token);
});

test('controller resolves Production deployment from DABBIR release evidence, not privileged alias API',()=>{
  assert.match(source,/current_alias_id\(\)[\s\S]*\/api\/release-evidence/);
  assert.doesNotMatch(source,/api\.vercel\.com\/v4\/aliases/);
  assert.match(source,/VERCEL_PROJECT_ACCESS_HTTP_/);
  const preflight=source.indexOf('preflight_vercel_access\n');
  const executableOffMutation=source.lastIndexOf('upsert_env 0 0');
  assert.ok(preflight>=0);
  assert.ok(executableOffMutation>preflight);
});

test('controller uses Vercel env upsert without printing response bodies containing values',()=>{
  assert.match(source,/\/v10\/projects\/\$\{VERCEL_PROJECT_ID\}\/env\?upsert=true/);
  assert.match(source,/decrypt=false/);
  assert.match(source,/::add-mask::\$VERCEL_TOKEN/);
  assert.doesNotMatch(source,/cat\s+"?\$response/);
  assert.doesNotMatch(source,/echo\s+"?\$payload/);
});

test('workflow cannot mutate Production from a PR branch and manual default is disable',()=>{
  assert.match(workflow,/push:\s*\n\s*branches: \[main\]/);
  assert.match(workflow,/default: disable/);
  assert.match(workflow,/cancel-in-progress: false/);
  assert.match(workflow,/bash -n scripts\/dabbir-qwen37-canary-control\.sh/);
  assert.match(workflow,/run: bash scripts\/dabbir-qwen37-canary-control\.sh/);
});
