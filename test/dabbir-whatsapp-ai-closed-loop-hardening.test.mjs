import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Native bounded role history and invalid provider envelopes are behavior-tested
// by dabbir-semantic-role-history and dabbir-semantic-provider-contract suites.
const ai=fs.readFileSync(new URL('../api/_dabbir-whatsapp-ai-core.js',import.meta.url),'utf8');
const menu=fs.readFileSync(new URL('../api/_dabbir-whatsapp-dispatch.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260907095800_dabbir_whatsapp_ai_service_selected_state_v1.sql',import.meta.url),'utf8');

test('general AI delivery is conversation and branch scoped',()=>{
  assert.match(ai,/loadConversationConnectionWithServiceKey/);
  assert.match(ai,/loadConversationConnectionWithServiceKey\(key,context\.business\.id,context\.conversation\.id\)/);
  assert.doesNotMatch(ai,/loadBusinessConnectionWithServiceKey\(/);
});

test('service selection is a valid durable AI state',()=>{
  assert.match(migration,/service_selected/);
  assert.match(migration,/dabbir_ai_conversation_state_action_check/);
  assert.match(migration,/v_action not in \('none','service_selected','choose_slot'/);
});

test('service-menu ambiguous and permanent failures do not loop until dead-letter',()=>{
  assert.match(menu,/handleServiceFailure/);
  assert.match(menu,/error\?\.ambiguous===true/);
  assert.match(menu,/PERMANENT_SERVICE_FAILURES\.has\(code\)/);
  assert.match(menu,/serviceHandoff/);
  assert.doesNotMatch(menu,/catch\(error\)\{await finish\(claim,'RETRY'/);
});

test('branch and business configuration drift escalates immediately instead of consuming retries',()=>{
  for(const code of [
    'AI_CONVERSATION_BRANCH_INACTIVE','AI_BLOCKED_BY_HUMAN_TAKEOVER','BUSINESS_PROFILE_UNVERIFIED','ACTION_SERVICE_NOT_AVAILABLE_IN_BRANCH','ACTION_WORKER_NOT_AVAILABLE_IN_BRANCH','ACTION_WORKER_SERVICE_MISMATCH','DABBIR_SERVICE_NOT_AVAILABLE_IN_BRANCH','DABBIR_WORKER_NOT_ASSIGNED_TO_BRANCH',
  ]){
    assert.match(menu,new RegExp(`PERMANENT_SERVICE_FAILURES[\\s\\S]*['\"]${code}['\"]`),`${code} must be terminal in service-menu policy`);
    assert.match(ai,new RegExp(`PERMANENT_AI_FAILURES[\\s\\S]*['\"]${code}['\"]`),`${code} must be terminal in general AI policy`);
  }
  assert.match(ai,/PERMANENT_AI_FAILURES\.has\(code\)[\s\S]*requireHumanForFailure/);
  assert.match(menu,/PERMANENT_SERVICE_FAILURES\.has\(code\)[\s\S]*serviceHandoff/);
});

test('persistent legacy and V3 interpreter failures escalate before exhausting the standard five attempts',()=>{
  assert.match(ai,/\['AI_PLANNER_CONTRACT_INVALID','V3_INTERPRETER_CONTRACT_INVALID','V3_INTERPRETER_UNAVAILABLE'\]\.includes\(code\)&&Number\(claim\?\.attempt_count\|\|0\)>=2/);
  assert.match(ai,/Number\(claim\?\.attempt_count\|\|0\)>=5/);
  assert.match(ai,/requireHumanForFailure/);
});
