import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PREFLIGHT_STATES,
  compareMigrationLineage,
  evaluatePreflight,
} from '../scripts/dabbir-live-ddl-lineage-preflight.mjs';

const read=relative=>fs.readFileSync(fileURLToPath(new URL(`../${relative}`,import.meta.url)),'utf8');
const VALID_MD5='0123456789abcdef0123456789abcdef'; // synthetic test constant — not derived from any real definition
const release={
  commit_sha:'a'.repeat(40),
  deployment_id:'dpl_test',
  environment:'production',
  git_ref:'main',
  project_id:'prj_HCTFdQo8Vc7FvZRdJ37H7KFYwpUq',
  repository:'barman-systems/pilot',
};

const expected=[
  {version:'20260911170343',name:'one'},
  {version:'20260911184500',name:'two'},
];
const snapshot={
  migration_history:[
    {version:'20260911170343',name:'one',statements_md5:VALID_MD5},
    {version:'20260911184500',name:'two',statements_md5:VALID_MD5},
  ],
  functions:[
    {
      schema_name:'public',
      function_name:'example',
      identity_arguments:'',
      definition_md5:VALID_MD5,
      acl_md5:VALID_MD5,
      search_path_md5:VALID_MD5,
      security_definer:true,
    },
  ],
};

test('preflight state contract is explicit and contains no boolean authorization state',()=>{
  assert.deepEqual(PREFLIGHT_STATES,[
    'BASELINE_MATCH',
    'BASELINE_CHANGED',
    'PRODUCTION_DRIFT_DURING_PREFLIGHT',
    'UNKNOWN',
    'FAIL_CLOSED',
  ]);
});

test('atomic SQL is repeatable-read and read-only and reads all required evidence classes',()=>{
  const sql=read('scripts/sql/dabbir-live-ddl-lineage-preflight.sql');
  assert.match(sql,/BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/);
  assert.match(sql,/supabase_migrations\.schema_migrations/);
  assert.match(sql,/pg_get_functiondef/);
  assert.match(sql,/proacl/);
  assert.match(sql,/search_path/);
  assert.match(sql,/prosecdef/);
  assert.match(sql,/COMMIT;\s*$/);
  assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i);
});

test('workflow is a dedicated migration-path required candidate and uses only the read-only database query surface',()=>{
  const workflow=read('.github/workflows/dabbir-live-ddl-lineage-preflight.yml');
  const runner=read('scripts/dabbir-live-ddl-lineage-preflight.mjs');
  assert.match(workflow,/name:\s*DABBIR Live DDL Lineage Preflight/);
  assert.match(workflow,/pull_request:/);
  assert.match(workflow,/supabase\/migrations\/\*\*/);
  assert.match(workflow,/node scripts\/dabbir-live-ddl-lineage-preflight\.mjs/);
  assert.match(runner,/database\/query\/read-only/);
  assert.doesNotMatch(workflow,/supabase\s+(?:db\s+push|migration\s+repair)/i);
  assert.doesNotMatch(runner,/database\/migrations|apply_migration|db push/i);
});

test('matching migration lineage with valid evidence returns UNKNOWN pending independent Phase B manifest',()=>{
  const result=evaluatePreflight({expectedMigrations:expected,liveSnapshot:snapshot,releaseBefore:release,releaseAfter:{...release}});
  assert.equal(result.evidence_validation.ok,true);
  assert.equal(result.lineage.match,true);
  assert.equal(result.state,'UNKNOWN');
  assert.equal(result.reason,'PHASE_B_EXPECTED_MANIFEST_NOT_AVAILABLE');
});

test('migration history change returns BASELINE_CHANGED',()=>{
  const changed={...snapshot,migration_history:[snapshot.migration_history[0]]};
  const result=evaluatePreflight({expectedMigrations:expected,liveSnapshot:changed,releaseBefore:release,releaseAfter:{...release}});
  assert.equal(result.evidence_validation.ok,true);
  assert.equal(result.lineage.match,false);
  assert.equal(result.state,'BASELINE_CHANGED');
  assert.equal(result.reason,'MIGRATION_HISTORY_DIFFERS_FROM_REPOSITORY_BASE');
  assert.ok(result.lineage.missing.includes('20260911184500:two'));
});

test('production identity movement during preflight is explicit drift',()=>{
  const result=evaluatePreflight({
    expectedMigrations:expected,
    liveSnapshot:snapshot,
    releaseBefore:release,
    releaseAfter:{...release,deployment_id:'dpl_changed'},
  });
  assert.equal(result.state,'PRODUCTION_DRIFT_DURING_PREFLIGHT');
});

test('incomplete live evidence is UNKNOWN and never promoted to a match',()=>{
  const result=evaluatePreflight({expectedMigrations:expected,liveSnapshot:{migration_history:[],functions:[]},releaseBefore:release,releaseAfter:{...release}});
  assert.equal(result.state,'UNKNOWN');
});

test('lineage comparison is exact on canonical version and migration name',()=>{
  const same=compareMigrationLineage(expected,snapshot.migration_history);
  assert.equal(same.match,true);
  const renamed=compareMigrationLineage(expected,[
    snapshot.migration_history[0],
    {...snapshot.migration_history[1],name:'generated_remote_name'},
  ]);
  assert.equal(renamed.match,false);
  assert.deepEqual(renamed.unexpected,['20260911184500:generated_remote_name']);
});
