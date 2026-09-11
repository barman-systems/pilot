import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260911184500_barman_ceo_strict_closed_loop_v1.sql',import.meta.url),'utf8');

function fn(name,next){
  const start=sql.indexOf(`create or replace function public.${name}`);
  assert.ok(start>=0,`${name} missing`);
  const end=next?sql.indexOf(`create or replace function public.${next}`,start):sql.length;
  return sql.slice(start,end<0?sql.length:end);
}

const claim=fn('barman_executive_claim_v1','barman_executive_verify_command_v1');
const verify=fn('barman_executive_verify_command_v1','barman_executive_rollup_v1');
const rollup=fn('barman_executive_rollup_v1','barman_executive_self_diagnostic_v1');
const diagnostic=fn('barman_executive_self_diagnostic_v1');

test('phase B reuses the existing architecture and creates no new table',()=>{
  assert.doesNotMatch(sql,/\bcreate\s+table\b/i);
  assert.doesNotMatch(sql,/CEO V2|Decision Orchestrator|Memory Engine|Goal Engine|new agent/i);
  for(const table of ['executive_decisions','executive_memory','executive_goals','executive_actions','executive_evidence'])assert.match(sql,new RegExp(table));
});

test('claim fails closed without fresh sufficient external reality',()=>{
  assert.match(claim,/component='BARMAN Executive Reality'/);
  assert.match(claim,/interval '10 minutes'/);
  assert.match(claim,/STALE_REALITY/);
  assert.match(claim,/INSUFFICIENT_FRESH_EVIDENCE/);
  const realityGate=claim.indexOf("if v_observed_at is null");
  const action=claim.indexOf('insert into dabbir_private.executive_actions');
  assert.ok(realityGate>=0&&action>realityGate);
});

test('claim requires an existing decision and exact preselected lane',()=>{
  assert.match(claim,/c\.execution_lane=v_lane/);
  assert.match(claim,/exists\(\s*select 1\s*from dabbir_private\.executive_decisions/s);
  assert.match(claim,/EXECUTIVE_DECISION_REQUIRED_BEFORE_ACTION/);
  assert.match(claim,/DECISION_ROUTE_LANE_MISMATCH/);
  assert.doesNotMatch(claim,/coalesce\(c\.execution_lane/);
  assert.doesNotMatch(claim,/command_text\)\s*~\*/);
  const decision=claim.indexOf('select * into v_decision');
  const action=claim.indexOf('insert into dabbir_private.executive_actions');
  assert.ok(decision>=0&&action>decision);
});

test('decision trace is carried into run action and command execution plan',()=>{
  assert.match(claim,/'executive_decision_id',v_decision\.id/);
  assert.match(claim,/'decision_id',v_decision\.id/);
  assert.match(claim,/goal_id,action_type/);
  assert.match(claim,/update dabbir_private\.executive_decisions/);
  assert.match(claim,/'action_id',v_action_id/);
});

test('independent verifier remains a separate trust boundary',()=>{
  assert.match(verify,/EXECUTOR_CANNOT_VERIFY_OWN_COMMAND/);
  assert.match(verify,/EXECUTOR_EVIDENCE_REQUIRED_BEFORE_VERIFICATION/);
  assert.match(verify,/INDEPENDENT_VERIFIER/);
  assert.match(verify,/EXECUTIVE_DECISION_REQUIRED_BEFORE_VERIFICATION/);
  assert.match(verify,/verification_status='VERIFIED'/);
});

test('learning is written only after independent verification succeeds',()=>{
  const evidence=verify.indexOf("'INDEPENDENT_VERIFIER'");
  const memory=verify.indexOf('insert into dabbir_private.executive_memory');
  const goal=verify.indexOf('update dabbir_private.executive_goals');
  assert.ok(evidence>=0&&memory>evidence&&goal>memory);
  for(const field of ['expected_outcome','observed_outcome','difference','lesson','applicability','goal_impact','evidence_ref'])assert.match(verify,new RegExp(`'${field}'`));
  assert.match(verify,/ACTION_SUCCESS_GOAL_NOT_ACHIEVED/);
  assert.match(verify,/status=case when v_goal_impact='ACHIEVED' then 'completed' else status end/);
});

test('verified run becomes completed and links decision action memory and goal',()=>{
  assert.match(verify,/update dabbir_private\.executive_runs/);
  assert.match(verify,/status='completed'/);
  assert.match(verify,/'decision_id',v_decision\.id/);
  assert.match(verify,/'action_id',v_action_id/);
  assert.match(verify,/'memory_id',v_memory_id/);
  assert.match(verify,/'goal_id',v_goal_id/);
});

test('planner parent learns only after every child is independently verified',()=>{
  assert.match(rollup,/if v_verified_done=v_total then/);
  const allVerified=rollup.indexOf('if v_verified_done=v_total then');
  const memory=rollup.indexOf('insert into dabbir_private.executive_memory');
  assert.ok(allVerified>=0&&memory>allVerified);
  assert.match(rollup,/PARENT_EXECUTIVE_DECISION_REQUIRED_BEFORE_ROLLUP/);
  assert.match(rollup,/INDEPENDENT_CHILD_ROLLUP/);
  assert.match(rollup,/ACTION_SUCCESS_GOAL_NOT_ACHIEVED/);
});

test('self diagnostic distinguishes database liveness from external reality freshness',()=>{
  assert.match(diagnostic,/BARMAN Executive Reality/);
  assert.match(diagnostic,/v_reality_fresh/);
  assert.match(diagnostic,/'fresh',v_reality_fresh/);
  assert.match(diagnostic,/not v_reality_fresh/);
});

test('all strict security-definer entrypoints remain service-role only',()=>{
  const signatures=[
    'barman_executive_claim_v1\\(text,text,integer\\)',
    'barman_executive_verify_command_v1\\(uuid,text,text,text,jsonb\\)',
    'barman_executive_rollup_v1\\(\\)',
    'barman_executive_self_diagnostic_v1\\(\\)',
  ];
  for(const signature of signatures){
    assert.match(sql,new RegExp(`revoke all on function public\\.${signature} from public,anon,authenticated`,'i'));
    assert.match(sql,new RegExp(`grant execute on function public\\.${signature} to service_role`,'i'));
  }
});
