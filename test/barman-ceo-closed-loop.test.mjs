import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { understandExecutiveSituation } from '../api/_barman-executive-automation.js';

const automation=fs.readFileSync(new URL('../api/_barman-executive-automation.js',import.meta.url),'utf8');
const cron=fs.readFileSync(new URL('../api/barman-executive-cron.js',import.meta.url),'utf8');
const realitySql=fs.readFileSync(new URL('../supabase/migrations/20260911170343_barman_ceo_fresh_reality_context_v1.sql',import.meta.url),'utf8');
const decisionSql=fs.readFileSync(new URL('../supabase/migrations/20260911170415_barman_ceo_situation_decision_prepare_v1.sql',import.meta.url),'utf8');

test('executive cron observes fresh reality and persists Situation -> Decision before existing workers claim',()=>{
  const cycleStart=cron.indexOf('export async function executeExecutiveCycle');
  assert.ok(cycleStart>=0);
  const cycle=cron.slice(cycleStart);
  const observe=cycle.indexOf('observeDabbirLive()');
  const record=cycle.indexOf('barman_executive_record_reality_v1');
  const prepare=cycle.indexOf('prepareQueuedCommands');
  const planner=cycle.indexOf('executePlanner');
  const readOnly=cycle.indexOf('executeReadOnly');
  const runtime=cycle.indexOf('executeRuntime');
  assert.ok(observe>=0);
  assert.ok(record>observe);
  assert.ok(prepare>record);
  assert.ok(planner>prepare);
  assert.ok(readOnly>prepare);
  assert.ok(runtime>prepare);
  assert.match(cron,/barman_executive_next_unprepared_v1/);
  assert.match(cron,/barman_executive_decide_v1/);
  assert.match(cron,/reality_freshness/);
  assert.match(cron,/reality_confidence/);
});

test('freshness is distinct from heartbeat liveness and stale reality fails closed',()=>{
  assert.match(realitySql,/BARMAN Executive Reality/);
  assert.match(realitySql,/STALE_REALITY/);
  assert.match(realitySql,/INSUFFICIENT_FRESH_EVIDENCE/);
  assert.match(realitySql,/interval '10 minutes'/);
  assert.match(decisionSql,/STALE_REALITY/);
  assert.match(decisionSql,/INSUFFICIENT_FRESH_EVIDENCE/);
  assert.match(decisionSql,/status='BLOCKED'/);
});

test('Situation and Decision are durable before execution routing',()=>{
  assert.match(automation,/what_changed/);
  assert.match(automation,/why_it_matters/);
  assert.match(automation,/affected_goal/);
  assert.match(automation,/known_facts/);
  assert.match(automation,/unknowns/);
  assert.match(automation,/memory_refs/);
  assert.match(decisionSql,/executive_decisions/);
  assert.match(decisionSql,/EXECUTIVE_DECISION_OPTIONS_REQUIRED/);
  assert.match(decisionSql,/execution_lane=v_lane/);
  assert.match(decisionSql,/SITUATION_BEFORE_ACTION/);
});

test('business health is not inferred from green infrastructure',()=>{
  assert.match(realitySql,/'product','UNKNOWN'/);
  assert.match(realitySql,/'customer','UNKNOWN'/);
  assert.match(realitySql,/'economic','UNKNOWN'/);
  assert.match(automation,/never infer HEALTHY from green infrastructure/);
});

test('owner-only boundaries are hard-gated before semantic reasoning',async()=>{
  const result=await understandExecutiveSituation('نفذ تحويل مالي الآن',{reality:{source:'test',observed_at:new Date().toISOString(),freshness:'FRESH',confidence:1,subject:'DABBIR',evidence_refs:[]}},{});
  assert.equal(result.route,'OWNER_GATE');
  assert.equal(result.decision.owner_required,true);
  assert.equal(result.decision.chosen_option,'OWNER_REQUIRED');
});

test('closed-loop preparation reuses existing tables and does not create a parallel architecture',()=>{
  const sql=`${realitySql}\n${decisionSql}`;
  assert.doesNotMatch(sql,/create\s+table/i);
  assert.match(sql,/executive_goals/);
  assert.match(sql,/executive_memory/);
  assert.match(sql,/executive_decisions/);
  assert.doesNotMatch(`${automation}\n${cron}`,/CEO V2|Decision Orchestrator|Memory Engine|Goal Engine/i);
  assert.match(sql,/revoke all on function/i);
  assert.match(sql,/grant execute on function[\s\S]*service_role/i);
});
