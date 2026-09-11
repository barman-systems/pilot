import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260911203000_barman_ceo_closed_loop_v1.sql',import.meta.url),'utf8');
const cron=fs.readFileSync(new URL('../api/barman-executive-cron.js',import.meta.url),'utf8');
const broker=fs.readFileSync(new URL('../api/barman-tool-agent-broker.js',import.meta.url),'utf8');

test('closed loop reuses existing schema instead of creating a parallel executive architecture',()=>{
  assert.doesNotMatch(migration,/\bcreate\s+table\b/i);
  assert.doesNotMatch(migration,/CEO V2|Decision Orchestrator|Memory Engine|Goal Engine/i);
  for(const table of ['executive_goals','executive_decisions','executive_memory','executive_actions','executive_evidence','executive_incidents']){
    assert.match(migration,new RegExp(table));
  }
});

test('fresh external reality is persisted before the existing cron claims work',()=>{
  assert.match(cron,/observeDabbirLive\(\)/);
  assert.match(cron,/barman_executive_observe_v1/);
  assert.ok(cron.indexOf('observeExecutiveReality(key)')<cron.indexOf('executeExecutiveCycle(key)'));
  assert.match(migration,/STALE_REALITY/);
  assert.match(migration,/BARMAN-REALITY-FRESHNESS-GAP/);
  assert.match(migration,/interval '10 minutes'/);
});

test('claim persists Situation and Decision and links Goal before creating Action',()=>{
  const claimStart=migration.indexOf('create or replace function public.barman_executive_claim_v1');
  const decisionAt=migration.indexOf('insert into dabbir_private.executive_decisions',claimStart);
  const actionAt=migration.indexOf('insert into dabbir_private.executive_actions',claimStart);
  assert.ok(claimStart>=0&&decisionAt>claimStart&&actionAt>decisionAt);
  assert.match(migration,/'what_changed'/);
  assert.match(migration,/'why_it_matters'/);
  assert.match(migration,/'affected_goal'/);
  assert.match(migration,/'known_facts'/);
  assert.match(migration,/'unknowns'/);
  assert.match(migration,/goal_id,action_type/);
});

test('owner-only authority stops before action creation for that command',()=>{
  assert.match(migration,/v_owner_required/);
  assert.match(migration,/decision_id',v_decision_id,'owner_required',true/);
  assert.match(migration,/blocked_reason='OWNER_REQUIRED'/);
  assert.match(migration,/return jsonb_build_object\('ok',true,'claimed',false,'reason','OWNER_REQUIRED'/);
});

test('tool-agent uses hard safety gate then semantic understanding with verified memory context',()=>{
  assert.match(broker,/HARD_SAFETY_OR_STRUCTURE_GATE/);
  assert.match(broker,/barman_executive_context_for_worker_v1/);
  assert.match(broker,/semanticRoute\(body\.command,context\)/);
  assert.match(broker,/barman_executive_record_route_for_worker_v1/);
  assert.match(broker,/Verified executive memories may influence the reason only when materially similar/);
  assert.match(broker,/investigation.*root-cause.*proof.*repair.*verification.*acceptance gates/s);
  assert.match(broker,/understanding_source:'AI_GATEWAY'/);
  assert.match(broker,/understanding_source:'DETERMINISTIC_FALLBACK'/);
});

test('learning is created only inside independent verification and updates the existing goal',()=>{
  const verifyStart=migration.indexOf('create or replace function public.barman_executive_verify_command_v1');
  const verifiedEvidenceAt=migration.indexOf("'INDEPENDENT_VERIFIER'",verifyStart);
  const memoryAt=migration.indexOf('insert into dabbir_private.executive_memory',verifyStart);
  const goalAt=migration.indexOf('update dabbir_private.executive_goals',verifyStart);
  assert.ok(verifyStart>=0&&verifiedEvidenceAt>verifyStart&&memoryAt>verifiedEvidenceAt&&goalAt>memoryAt);
  assert.match(migration,/'expected_outcome'/);
  assert.match(migration,/'observed_outcome'/);
  assert.match(migration,/'difference'/);
  assert.match(migration,/'lesson'/);
  assert.match(migration,/'applicability'/);
  assert.match(migration,/ACTION_SUCCESS_GOAL_NOT_ACHIEVED|goal_impact/);
});

test('verified memories are returned into the next decision context',()=>{
  assert.match(migration,/create or replace function public\.barman_executive_context_for_worker_v1/);
  assert.match(migration,/from dabbir_private\.executive_memory m/);
  assert.match(migration,/m\.confidence>=0\.5/);
  assert.match(migration,/'memories',v_memories/);
  assert.match(broker,/executive_context:executiveContext/);
  assert.match(broker,/memory_refs_used/);
});

test('independent verifier and service-role trust boundary remain fail-closed',()=>{
  assert.match(migration,/EXECUTOR_CANNOT_VERIFY_OWN_COMMAND/);
  assert.match(migration,/EXECUTOR_EVIDENCE_REQUIRED_BEFORE_VERIFICATION/);
  for(const fn of ['barman_executive_observe_v1','barman_executive_context_for_worker_v1','barman_executive_record_route_for_worker_v1','barman_executive_claim_v1','barman_executive_verify_command_v1','barman_executive_self_diagnostic_v1']){
    assert.match(migration,new RegExp(`revoke all on function public\\.${fn}`,'i'));
    assert.match(migration,new RegExp(`grant execute on function public\\.${fn}[^;]+to service_role`,'i'));
  }
});

test('executive health cannot be healthy when reality is stale',()=>{
  assert.match(migration,/v_reality_fresh/);
  assert.match(migration,/when not v_reality_fresh/);
  assert.match(migration,/'reality',jsonb_build_object\('observed_at',v_reality_at,'age_seconds',v_reality_age,'fresh',v_reality_fresh\)/);
});
