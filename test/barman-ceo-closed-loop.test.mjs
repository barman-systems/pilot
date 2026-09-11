import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const core=fs.readFileSync(new URL('../supabase/migrations/20260911203000_barman_ceo_closed_loop_v1.sql',import.meta.url),'utf8');
const routing=fs.readFileSync(new URL('../supabase/migrations/20260911204500_barman_ceo_closed_loop_routing_v1.sql',import.meta.url),'utf8');
const sql=`${core}\n${routing}`;
const cron=fs.readFileSync(new URL('../api/barman-executive-cron.js',import.meta.url),'utf8');
const broker=fs.readFileSync(new URL('../api/barman-tool-agent-broker.js',import.meta.url),'utf8');
const automation=fs.readFileSync(new URL('../api/_barman-executive-automation.js',import.meta.url),'utf8');

test('closed loop reuses existing schema instead of creating a parallel executive architecture',()=>{
  assert.doesNotMatch(sql,/\bcreate\s+table\b/i);
  assert.doesNotMatch(sql,/CEO V2|Decision Orchestrator|Memory Engine|Goal Engine/i);
  for(const table of ['executive_goals','executive_decisions','executive_memory','executive_actions','executive_evidence','executive_incidents'])assert.match(sql,new RegExp(table));
});

test('fresh external reality is persisted before semantic routing and all existing executors',()=>{
  assert.match(cron,/observeDabbirLive\(\)/);
  assert.match(cron,/barman_executive_observe_v1/);
  const observeAt=cron.indexOf('observeExecutiveReality(key)');
  const routeAt=cron.indexOf('routePendingExecutiveWork(key)');
  const executeAt=cron.indexOf('executeExecutiveCycle(key)');
  assert.ok(observeAt>=0&&routeAt>observeAt&&executeAt>routeAt);
  assert.match(routing,/STALE_REALITY/);
  assert.match(routing,/BARMAN-REALITY-FRESHNESS-GAP/);
  assert.match(routing,/interval '10 minutes'/);
});

test('semantic understanding creates Situation and Decision before execution lane can create Action',()=>{
  assert.match(cron,/understandExecutiveCommand\(command\.command_text,pending\)/);
  assert.match(cron,/barman_executive_route_pending_v1/);
  assert.match(automation,/Understand the whole owner situation before choosing an existing execution route/);
  assert.match(automation,/required_phases/);
  assert.match(automation,/memory_refs_used/);
  const routeFn=routing.slice(routing.indexOf('create or replace function public.barman_executive_route_pending_v1'),routing.indexOf('create or replace function public.barman_executive_record_route_for_worker_v1'));
  assert.match(routeFn,/insert into dabbir_private\.executive_decisions/);
  assert.match(routeFn,/'affected_goal'/);
  assert.match(routeFn,/'freshness','FRESH'/);
  assert.match(routeFn,/'health_dimensions'/);
  const claimFn=routing.slice(routing.indexOf('create or replace function public.barman_executive_claim_v1'),routing.indexOf('create or replace function public.barman_executive_self_diagnostic_v1'));
  assert.match(claimFn,/c\.execution_lane=v_lane/);
  assert.match(claimFn,/exists\(select 1 from dabbir_private\.executive_decisions/);
  assert.doesNotMatch(claimFn,/coalesce\(c\.execution_lane/);
  assert.ok(routeFn.indexOf('insert into dabbir_private.executive_decisions')>=0&&claimFn.indexOf('insert into dabbir_private.executive_actions')>=0);
});

test('owner-only and unsupported external authority stop before Action creation',()=>{
  const routeFn=routing.slice(routing.indexOf('create or replace function public.barman_executive_route_pending_v1'),routing.indexOf('create or replace function public.barman_executive_record_route_for_worker_v1'));
  assert.match(routeFn,/OWNER_REQUIRED/);
  assert.match(routeFn,/EXTERNAL_ACTION_EXECUTOR_UNAVAILABLE/);
  assert.match(routeFn,/REVIEW_REQUIRED_NO_SAFE_EXECUTION_CLASS/);
  assert.match(routeFn,/if v_block_reason is not null then/);
  assert.doesNotMatch(routeFn,/insert into dabbir_private\.executive_actions/);
});

test('complex root-cause commands preserve investigation proof repair verification and acceptance semantics',()=>{
  assert.match(automation,/investigation/);
  assert.match(automation,/root_cause/);
  assert.match(automation,/proof/);
  assert.match(automation,/repair/);
  assert.match(automation,/verification/);
  assert.match(automation,/acceptance_gate/);
  assert.match(automation,/never collapse them into the route label/);
  assert.match(automation,/understanding_source:'AI_GATEWAY'/);
  assert.match(automation,/DETERMINISTIC_FALLBACK/);
});

test('exact memory IDs used by understanding are validated and persisted into the decision',()=>{
  assert.match(automation,/allowedMemoryIds/);
  assert.match(automation,/memory_refs_used.*allowedMemoryIds/s);
  assert.match(routing,/EXECUTIVE_MEMORY_REF_INVALID/);
  assert.match(routing,/'memory_refs_used',v_memory_refs/);
  assert.match(routing,/m\.confidence>=0\.5/);
  assert.match(routing,/m\.superseded_by is null/);
  assert.match(broker,/memory_refs_used/);
});

test('learning is created only inside independent verification and updates the existing goal',()=>{
  const verifyStart=core.indexOf('create or replace function public.barman_executive_verify_command_v1');
  const verifiedEvidenceAt=core.indexOf("'INDEPENDENT_VERIFIER'",verifyStart);
  const memoryAt=core.indexOf('insert into dabbir_private.executive_memory',verifyStart);
  const goalAt=core.indexOf('update dabbir_private.executive_goals',verifyStart);
  assert.ok(verifyStart>=0&&verifiedEvidenceAt>verifyStart&&memoryAt>verifiedEvidenceAt&&goalAt>memoryAt);
  assert.match(core,/'expected_outcome'/);
  assert.match(core,/'observed_outcome'/);
  assert.match(core,/'difference'/);
  assert.match(core,/'lesson'/);
  assert.match(core,/'applicability'/);
  assert.match(core,/'goal_impact'/);
});

test('verified memories are fed into the next semantic decision context',()=>{
  assert.match(routing,/create or replace function public\.barman_executive_pending_for_routing_v1/);
  assert.match(routing,/from dabbir_private\.executive_memory m/);
  assert.match(routing,/'memories',v_memories/);
  assert.match(cron,/understandExecutiveCommand\(command\.command_text,pending\)/);
  assert.match(automation,/supplied verified executive memories/);
});

test('business health cannot be hidden behind green infrastructure',()=>{
  assert.match(cron,/dabbir_owner_measurement_snapshot_v1/);
  assert.match(cron,/measurement_health/);
  assert.match(routing,/health_dimensions/);
  assert.match(routing,/v_measurement_overall<>'COMPLETE'/);
  assert.match(routing,/'product',v_product_health/);
  assert.match(routing,/'customer',v_customer_health/);
  assert.match(routing,/'economic',v_economic_health/);
  assert.match(routing,/'strategic',v_strategic_health/);
  assert.match(routing,/UNPROVEN/);
});

test('independent verifier and service-role trust boundary remain fail-closed',()=>{
  assert.match(core,/EXECUTOR_CANNOT_VERIFY_OWN_COMMAND/);
  assert.match(core,/EXECUTOR_EVIDENCE_REQUIRED_BEFORE_VERIFICATION/);
  for(const fn of ['barman_executive_observe_v1','barman_executive_pending_for_routing_v1','barman_executive_route_pending_v1','barman_executive_record_route_for_worker_v1','barman_executive_claim_v1','barman_executive_self_diagnostic_v1']){
    assert.match(routing,new RegExp(`revoke all on function public\\.${fn}`,'i'));
    assert.match(routing,new RegExp(`grant execute on function public\\.${fn}[^;]+to service_role`,'i'));
  }
  assert.match(core,/revoke all on function public\.barman_executive_verify_command_v1/);
  assert.match(core,/grant execute on function public\.barman_executive_verify_command_v1[^;]+to service_role/);
});

test('closed-loop trace persists Decision to Action to Verification to Memory to Goal outcome',()=>{
  assert.match(routing,/'decision_id',v_decision\.id/);
  assert.match(routing,/'action_id',v_action_id/);
  assert.match(core,/'memory_id',v_memory_id/);
  assert.match(core,/'goal_id',v_goal_id/);
  assert.match(core,/'goal_impact',v_goal_impact/);
  assert.match(core,/verification_status','VERIFIED/);
});
