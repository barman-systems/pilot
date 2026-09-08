import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const core=fs.readFileSync(new URL('../api/_dabbir-whatsapp-ai-core.js',import.meta.url),'utf8');

const router=fs.readFileSync(new URL('../api/_dabbir-understanding-orchestrator.js',import.meta.url),'utf8');
const semantic=fs.readFileSync(new URL('../api/_dabbir-semantic-engine.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260908025920_dabbir_understanding_engine_v2.sql',import.meta.url),'utf8');
const must=(needle,msg)=>assert.ok(core.includes(needle),msg||`missing ${needle}`);

test('planner requests structured intent, confidence, risk and missing facts',()=>{
  must('"intent":"SUPPORT|SERVICE_DISCOVERY|BOOKING|CANCEL_BOOKING|RESCHEDULE_BOOKING|HUMAN_ASSISTANCE"');
  must('"confidence":0.0');
  must('"risk_level":"LOW|MEDIUM|HIGH"');
  must('"missing_fields":[]');
  must('"reason_code":"SHORT_CODE"');
  must('confidence means confidence that the chosen action is supported by VERIFIED CONTEXT');
});

test('high-risk and incomplete mutations cannot execute silently',()=>{
  must("decision.riskLevel==='HIGH'&&decision.action!=='HANDOFF'");
  must("action:'HANDOFF'");
  must("reasonCode:'HIGH_RISK_ESCALATION'");
  must('MUTATING_ACTIONS.has(decision.action)&&decision.missingFields.length');
  must("action:'REPLY'");
  must("reasonCode:'MUTATION_BLOCKED_MISSING_FIELDS'");
});

test('every AI planner decision is persisted to the operator ledger RPC',()=>{
  must("serviceRpc('dabbir_record_ai_operator_decision_v1'");
  must('p_confidence:Number.isFinite(Number(decision.confidence))');
  must('p_risk_level:decision.riskLevel');
  must('p_missing_fields:arr(decision.missingFields)');
  assert.match(core,/return runUnderstandingTurn/);
  assert.match(router,/rpc\('dabbir_record_ai_operator_decision_v1'/);
});

test('deterministic human and verified slot choices also produce decisions',()=>{
  assert.match(semantic,/CUSTOMER_REQUESTED_HUMAN/);
  assert.match(semantic,/VERIFIED_SLOT_SELECTION/);
  assert.match(router,/p_confidence:decision.confidence/);
});

test('structured telemetry failure remains non-blocking while deterministic actions remain authoritative',()=>{
  must('}).catch(()=>null);');
  must("serviceRpc('dabbir_whatsapp_ai_create_booking'");
  assert.match(migration,/public.dabbir_whatsapp_ai_cancel_booking/);
  must("serviceRpc('dabbir_whatsapp_ai_reschedule_booking'");
});
