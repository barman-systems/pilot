import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const broker=fs.readFileSync(new URL('../api/barman-independent-verifier.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../scripts/barman-independent-verifier.mjs',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../.github/workflows/barman-independent-verifier.yml',import.meta.url),'utf8');
const waitProduction=fs.readFileSync(new URL('../scripts/wait-dabbir-production-sha.mjs',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260903211000_barman_independent_verifier_v7.sql',import.meta.url),'utf8');
const poisonFix=fs.readFileSync(new URL('../supabase/migrations/20260913130500_barman_verifier_stale_snapshot_queue_fix.sql',import.meta.url),'utf8');

test('independent verifier has a distinct GitHub OIDC identity',()=>{
  assert.match(broker,/AUDIENCE='barman-executive-independent-verifier'/);
  assert.match(broker,/barman-independent-verifier\.yml@\$\{EXPECTED_REF\}/);
  assert.match(broker,/payload\?\.ref===EXPECTED_REF/);
  assert.match(broker,/\['schedule','workflow_dispatch','push'\]/);
  assert.doesNotMatch(broker,/barman-executive-tool-agent/);
  assert.match(workflow,/push:\s*\n\s*branches:\s*\n\s*- main/);
  assert.match(workflow,/github\.event_name == 'push'/);
  assert.match(workflow,/wait-dabbir-production-sha\.mjs/);
  assert.match(waitProduction,/release-evidence/);
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

test('mutable snapshot evidence is fresh, exact, and cannot assume monotonic growth',()=>{
  assert.match(worker,/SNAPSHOT_MAX_AGE_MS=30\*60\*1000/);
  assert.match(worker,/SNAPSHOT_GENERATED_AT_INVALID/);
  assert.match(worker,/SNAPSHOT_GENERATED_AT_FUTURE/);
  assert.match(worker,/SNAPSHOT_EVIDENCE_STALE/);
  assert.match(worker,/now===reported/);
  assert.match(worker,/SNAPSHOT_METRIC_MISMATCH_/);
  assert.doesNotMatch(worker,/now>=reported/);
  assert.match(worker,/AUTHORITATIVE_DB_FRESH_RECHECK/);
});

test('verification mismatches terminally fail closed without using the success verifier path',()=>{
  assert.match(worker,/phase:'reject'/);
  assert.match(worker,/INDEPENDENT_VERIFICATION_REJECTED/);
  assert.match(worker,/INDEPENDENT_VERIFICATION_REJECTION_FAILED/);
  assert.match(broker,/phase==='reject'/);
  assert.match(broker,/barman_executive_reject_verification_v1/);
  assert.match(poisonFix,/verification_status='FAILED'/);
  assert.match(poisonFix,/orchestration_state='FAILED'/);
  assert.match(poisonFix,/INDEPENDENT_REJECT/);
  assert.match(poisonFix,/EXECUTOR_CANNOT_REJECT_OWN_COMMAND/);
  assert.match(poisonFix,/EXECUTOR_EVIDENCE_REQUIRED_BEFORE_REJECTION/);
  assert.doesNotMatch(poisonFix,/insert into dabbir_private\.executive_memory/i);
  assert.doesNotMatch(poisonFix,/set verification_status='VERIFIED'/i);
});

test('database claim is restricted to the dedicated verifier identity',()=>{
  assert.match(migration,/\^github-independent-verifier:\[0-9\]\+\$/);
  assert.match(migration,/VERIFIER_ID_DENIED/);
  assert.match(migration,/INDEPENDENT_REQUIRED/);
  assert.match(migration,/SEPARATE_GITHUB_OIDC_VERIFIER/);
  assert.match(migration,/revoke all on function public\.barman_executive_claim_verification_v1\(text\) from public, anon, authenticated/i);
  assert.match(migration,/grant execute on function public\.barman_executive_claim_verification_v1\(text\) to service_role/i);
  assert.match(poisonFix,/revoke all on function public\.barman_executive_reject_verification_v1\(uuid,text,text,jsonb\) from public, anon, authenticated/i);
  assert.match(poisonFix,/grant execute on function public\.barman_executive_reject_verification_v1\(uuid,text,text,jsonb\) to service_role/i);
});

test('executive snapshot excludes structurally marked and legacy QA businesses',()=>{
  assert.match(poisonFix,/raw_user_meta_data->>'dabbir_qa'/);
  assert.match(poisonFix,/b\.name like 'DABBIR AI QA %'/);
  assert.match(poisonFix,/b\.slug like 'qa-%'/);
  assert.match(poisonFix,/'metric_scope','NON_QA_PRODUCTION_V1'/);
  assert.match(poisonFix,/not exists\(select 1 from qa_businesses q where q\.id=b\.id\)/);
});
