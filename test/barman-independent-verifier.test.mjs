import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const broker=fs.readFileSync(new URL('../api/barman-independent-verifier.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../scripts/barman-independent-verifier.mjs',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../.github/workflows/barman-independent-verifier.yml',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260903211000_barman_independent_verifier_v7.sql',import.meta.url),'utf8');

test('independent verifier has a distinct GitHub OIDC identity',()=>{
  assert.match(broker,/AUDIENCE='barman-executive-independent-verifier'/);
  assert.match(broker,/barman-independent-verifier\.yml@\$\{EXPECTED_REF\}/);
  assert.match(broker,/payload\?\.ref===EXPECTED_REF/);
  assert.match(broker,/\['schedule','workflow_dispatch'\]/);
  assert.doesNotMatch(broker,/barman-executive-tool-agent/);
  assert.match(workflow,/id-token: write/);
  assert.match(workflow,/contents: read/);
  assert.match(workflow,/actions: read/);
  assert.match(workflow,/pull-requests: read/);
  assert.doesNotMatch(workflow,/contents: write/);
});

test('verifier rechecks external reality instead of trusting executor verified flags',()=>{
  assert.match(worker,/PR_NOT_MERGED/);
  assert.match(worker,/WORKFLOW_NOT_SUCCESSFUL/);
  assert.match(worker,/COMMIT_NOT_ON_MAIN_ANCESTRY/);
  assert.match(worker,/PRODUCTION_NO_LONGER_DESCENDS_FROM_EXECUTOR_SHA/);
  assert.match(worker,/QA_DATABASE_PROJECT_MISMATCH/);
  assert.match(worker,/EVIDENCE_TYPE_UNSUPPORTED_/);
  assert.doesNotMatch(worker,/item\?\.verified/);
  assert.doesNotMatch(worker,/AI_GATEWAY/);
});

test('verification mismatches are fail closed and cannot invoke a failure mutation',()=>{
  assert.match(worker,/INDEPENDENT_VERIFICATION_MISMATCH_UNPROMOTED/);
  assert.match(worker,/phase:'verify'/);
  assert.doesNotMatch(worker,/phase:'fail'/);
  assert.doesNotMatch(broker,/phase==='fail'/);
  assert.doesNotMatch(migration,/fail_verification/i);
});

test('database claim is restricted to the dedicated verifier identity',()=>{
  assert.match(migration,/\^github-independent-verifier:\[0-9\]\+\$/);
  assert.match(migration,/VERIFIER_ID_DENIED/);
  assert.match(migration,/INDEPENDENT_REQUIRED/);
  assert.match(migration,/SEPARATE_GITHUB_OIDC_VERIFIER/);
  assert.match(migration,/revoke all on function public\.barman_executive_claim_verification_v1\(text\) from public, anon, authenticated/i);
  assert.match(migration,/grant execute on function public\.barman_executive_claim_verification_v1\(text\) to service_role/i);
});
