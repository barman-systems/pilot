import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateFunctionEvidence,
  validateMigrationEvidence,
  validatePreflightEvidence,
} from '../scripts/dabbir-lineage-evidence-validation.mjs';
import { evaluatePreflight } from '../scripts/dabbir-live-ddl-lineage-preflight.mjs';

const md5a='a'.repeat(32);
const md5b='b'.repeat(32);
const md5c='c'.repeat(32);
const expectedMigrations=[{version:'20260901000000',name:'phase_a_fixture'}];
const liveMigration={version:'20260901000000',name:'phase_a_fixture',statements_md5:md5a};
const liveFunction={
  schema_name:'public',
  function_name:'phase_a_fixture',
  identity_arguments:'',
  definition_md5:md5a,
  acl_md5:md5b,
  search_path_md5:md5c,
  security_definer:false,
};
const goodSnapshot=()=>({migration_history:[{...liveMigration}],functions:[{...liveFunction}]});
const rejected=result=>{
  assert.equal(result.ok,false);
  assert.ok(typeof result.reason==='string'&&result.reason.length>0);
};
const releaseIdentity={
  commit_sha:'1'.repeat(40),deployment_id:'dpl_phase_a_fixture',environment:'production',git_ref:'main',
  project_id:'prj_HCTFdQo8Vc7FvZRdJ37H7KFYwpUq',repository:'barman-systems/pilot',
};

test('rejects missing functions evidence',()=>{
  const snapshot=goodSnapshot();
  delete snapshot.functions;
  rejected(validatePreflightEvidence({expectedMigrations,liveSnapshot:snapshot}));
});

test('rejects empty functions evidence',()=>{
  const snapshot=goodSnapshot();
  snapshot.functions=[];
  rejected(validatePreflightEvidence({expectedMigrations,liveSnapshot:snapshot}));
});

test('rejects empty function row object',()=>{
  const snapshot=goodSnapshot();
  snapshot.functions=[{}];
  rejected(validatePreflightEvidence({expectedMigrations,liveSnapshot:snapshot}));
});

test('rejects missing schema_name',()=>{
  const row={...liveFunction}; delete row.schema_name;
  rejected(validateFunctionEvidence([row]));
});

test('rejects missing function_name',()=>{
  const row={...liveFunction}; delete row.function_name;
  rejected(validateFunctionEvidence([row]));
});

test('rejects missing identity_arguments while allowing empty-string zero-arg identity',()=>{
  const row={...liveFunction}; delete row.identity_arguments;
  rejected(validateFunctionEvidence([row]));
  assert.equal(validateFunctionEvidence([{...liveFunction,identity_arguments:''}]).ok,true);
});

test('rejects missing definition_md5',()=>{
  const row={...liveFunction}; delete row.definition_md5;
  rejected(validateFunctionEvidence([row]));
});

test('rejects malformed definition_md5',()=>{
  rejected(validateFunctionEvidence([{...liveFunction,definition_md5:'not-an-md5'}]));
});

test('rejects missing acl_md5',()=>{
  const row={...liveFunction}; delete row.acl_md5;
  rejected(validateFunctionEvidence([row]));
});

test('rejects missing search_path_md5',()=>{
  const row={...liveFunction}; delete row.search_path_md5;
  rejected(validateFunctionEvidence([row]));
});

test('rejects non-boolean security_definer',()=>{
  rejected(validateFunctionEvidence([{...liveFunction,security_definer:'false'}]));
});

test('rejects migration row missing version or name',()=>{
  rejected(validateMigrationEvidence([{name:'phase_a_fixture',statements_md5:md5a}],{requireStatementsMd5:true,label:'LIVE_MIGRATION_EVIDENCE'}));
  rejected(validateMigrationEvidence([{version:'20260901000000',statements_md5:md5a}],{requireStatementsMd5:true,label:'LIVE_MIGRATION_EVIDENCE'}));
});

test('rejects duplicate function identity',()=>{
  rejected(validateFunctionEvidence([{...liveFunction},{...liveFunction,definition_md5:md5b}]));
});

test('rejects duplicate migration identity',()=>{
  rejected(validateMigrationEvidence([{...liveMigration},{...liveMigration,statements_md5:md5b}],{requireStatementsMd5:true,label:'LIVE_MIGRATION_EVIDENCE'}));
});

test('rejects general type mismatches',()=>{
  rejected(validateFunctionEvidence([{...liveFunction,schema_name:42}]));
  rejected(validateMigrationEvidence([{...liveMigration,version:20260901000000}],{requireStatementsMd5:true,label:'LIVE_MIGRATION_EVIDENCE'}));
});

test('structurally complete evidence advances past Phase A only',()=>{
  assert.deepEqual(validatePreflightEvidence({expectedMigrations,liveSnapshot:goodSnapshot()}),{
    ok:true,
    migration_count:1,
    function_count:1,
    phase:'STRUCTURAL_EVIDENCE_VALID',
  });
});

test('decision function fails closed on structurally invalid evidence',()=>{
  const result=evaluatePreflight({
    expectedMigrations,
    liveSnapshot:{migration_history:[{...liveMigration}],functions:[{}]},
    releaseBefore:releaseIdentity,
    releaseAfter:{...releaseIdentity},
  });
  assert.equal(result.state,'UNKNOWN');
  assert.notEqual(result.state,'BASELINE_MATCH');
});

test('decision function does not claim BASELINE_MATCH after Phase A structural success',()=>{
  const result=evaluatePreflight({
    expectedMigrations,
    liveSnapshot:goodSnapshot(),
    releaseBefore:releaseIdentity,
    releaseAfter:{...releaseIdentity},
  });
  assert.equal(result.state,'UNKNOWN');
  assert.equal(result.reason,'PHASE_B_EXPECTED_MANIFEST_NOT_AVAILABLE');
});

test.todo('Phase B: structurally complete but semantically different function hashes must be compared with an independent Expected Manifest');
