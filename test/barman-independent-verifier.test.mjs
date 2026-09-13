import fs from 'node:fs';

import vm from 'node:vm';

// Execute the actual worker with an isolated HTTP boundary; no live OIDC or DB calls.
async function runSnapshotWorker({ageMs=0, generatedAt, reported=13, current=13, snapshotStatus=200, rejectStatus=200}={}){
  const calls=[];
  const messages=[];
  const fakeProcess={env:{ACTIONS_ID_TOKEN_REQUEST_URL:'https://oidc.invalid/token',ACTIONS_ID_TOKEN_REQUEST_TOKEN:'synthetic-test-token'},exitCode:0,exit(){throw new Error('UNEXPECTED_EXIT')}};
  const response=(status,payload)=>({ok:status>=200&&status<300,status,json:async()=>payload});
  const fetch=async(url,options={})=>{
    if(String(url).startsWith('https://oidc.invalid/'))return response(200,{value:'synthetic-oidc'});
    assert.equal(url,'https://dabbir.bmalman.com/api/barman-independent-verifier');
    const body=JSON.parse(options.body);
    calls.push(body);
    if(body.phase==='claim')return response(200,{ok:true,claimed:true,command:{
      id:'11111111-1111-4111-8111-111111111111',worker_id:'executor-test',
      evidence:[{type:'query',reference:'barman-executive-snapshot-v1',details:{
        generated_at:generatedAt??new Date(Date.now()-ageMs).toISOString(),expected:{customers_total:reported}
      }}]
    }});
    if(body.phase==='snapshot')return response(snapshotStatus,{ok:snapshotStatus===200,snapshot:{customers:{total:current}}});
    if(body.phase==='reject')return response(rejectStatus,{ok:rejectStatus===200,rejected:{verification_status:'FAILED'}});
    if(body.phase==='verify')return response(200,{ok:true,verified:true});
    throw new Error('UNEXPECTED_PHASE');
  };
  const context=vm.createContext({process:fakeProcess,fetch,AbortSignal,Date,console:{log:(...v)=>messages.push(v.join(' ')),error:(...v)=>messages.push(v.join(' '))}});
  await new vm.Script('(async()=>{'+worker+'\n})()').runInContext(context);
  return {calls,messages,exitCode:fakeProcess.exitCode};
}

test('worker accepts a fresh equal snapshot and emits freshness provenance',async()=>{
  const r=await runSnapshotWorker();
  assert.deepEqual(r.calls.map(c=>c.phase),['claim','snapshot','verify']);
  assert.equal(r.calls[2].details.checks[0].source,'AUTHORITATIVE_DB_FRESH_RECHECK');
  assert.equal(r.exitCode,0);
});

for(const [name,options,reason] of [
  ['stale',{ageMs:31*60*1000},'SNAPSHOT_EVIDENCE_STALE'],
  ['future',{ageMs:-120000},'SNAPSHOT_GENERATED_AT_FUTURE'],
  ['invalid timestamp',{generatedAt:'invalid'},'SNAPSHOT_GENERATED_AT_INVALID'],
]){
  test('worker rejects '+name+' evidence before reading mutable state',async()=>{
    const r=await runSnapshotWorker(options);
    assert.deepEqual(r.calls.map(c=>c.phase),['claim','reject']);
    assert.equal(r.calls[1].reason,reason);
    assert.equal(r.exitCode,0);
  });
}

for(const current of [12,14]){
  test('worker rejects changed customer total '+current+' without promotion',async()=>{
    const r=await runSnapshotWorker({current});
    assert.deepEqual(r.calls.map(c=>c.phase),['claim','snapshot','reject']);
    assert.equal(r.calls[2].reason,'SNAPSHOT_METRIC_MISMATCH_CUSTOMERS_TOTAL');
    assert.equal(r.exitCode,0);
  });
}

test('transient snapshot failure never terminally rejects the command',async()=>{
  const r=await runSnapshotWorker({snapshotStatus:503});
  assert.deepEqual(r.calls.map(c=>c.phase),['claim','snapshot']);
  assert.equal(r.exitCode,1);
});

test('failed rejection RPC cannot be reported as successful verification',async()=>{
  const r=await runSnapshotWorker({ageMs:31*60*1000,rejectStatus:503});
  assert.deepEqual(r.calls.map(c=>c.phase),['claim','reject']);
  assert.equal(r.exitCode,1);
  assert.ok(r.messages.some(m=>m.includes('INDEPENDENT_VERIFICATION_REJECTION_FAILED')));
  assert.ok(r.messages.every(m=>!m.includes('INDEPENDENT_VERIFICATION_PASSED')));
});

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
