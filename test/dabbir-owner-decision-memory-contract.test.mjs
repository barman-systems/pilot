import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260827155500_dabbir_owner_decision_memory_v1.sql','utf8');
const api=fs.readFileSync('api/owner-decision-memory.js','utf8');
const ui=fs.readFileSync('api/dabbir-owner-decision-memory-ui.js','utf8');
const shell=fs.readFileSync('api/app-recovery.js','utf8');
const executable=migration.replace(/--.*$/gm,'');

test('owner observations never activate authority and candidates require three distinct observations',()=>{
  assert.match(migration,/having count\(\*\)>=3/i);
  assert.match(migration,/dabbir_owner_decision_observations_source_unique_idx/i);
  assert.match(migration,/where source_id is not null/i);
  assert.doesNotMatch(executable,/trigger[\s\S]{0,500}dabbir_owner_decision_observations[\s\S]{0,500}(activate|ACTIVE)/i);
  assert.match(migration,/explicit_confirmation boolean not null default false/i);
  assert.match(migration,/check\(state<>'ACTIVE' or \(explicit_confirmation and activated_at is not null\)\)/i);
});

test('learned authority is LOW-risk only and sensitive action families fail closed',()=>{
  assert.match(migration,/risk_class text not null check\(risk_class='LOW'\)/i);
  assert.match(migration,/if v_risk<>'LOW' then raise exception 'POLICY_MEMORY_LOW_RISK_ONLY'/i);
  for(const term of ['payment','refund','payout','legal','kyc','identity','bank','discount','price','money','tax','vat','credential','purchase']){
    assert.match(migration,new RegExp(term,'i'));
  }
  assert.match(api,/SENSITIVE_ACTION_NOT_LEARNABLE/);
});

test('matching is exact, scoped, explicitly active, and pause or revoke removes eligibility immediately',()=>{
  assert.match(migration,/p\.state='ACTIVE'/);
  assert.match(migration,/p\.explicit_confirmation/);
  assert.match(migration,/p\.match_fingerprint=md5\(v_bounds::text\)/);
  assert.match(migration,/p\.match_bounds=v_bounds/);
  assert.match(migration,/v_new not in\('ACTIVE','PAUSED','REVOKED'\)/);
  assert.match(migration,/state=v_new/);
});

test('first autonomous execution is internal handoff suppression only',()=>{
  assert.match(migration,/handoff\.owner_decision\.continue_ai/);
  assert.match(migration,/upper\(coalesce\(p_route_class,''\)\)<>'OWNER_DECISION'/);
  assert.match(migration,/coalesce\(p_priority,100\)>40/);
  assert.match(migration,/if v_policy_id is not null then return null/);
  assert.match(migration,/external_side_effects',false/);
  assert.doesNotMatch(executable,/stripe|payment_intent|bank_transfer|withdrawal|send_whatsapp|graph\.facebook/i);
});

test('owner memory stores a SHA-256 reason fingerprint instead of raw handoff text',()=>{
  assert.match(migration,/extensions\.digest\(v_reason,'sha256'\)/);
  assert.match(migration,/reason_hash/);
  assert.doesNotMatch(migration,/jsonb_build_object\('route_class','OWNER_DECISION','reason',v_reason/i);
  assert.doesNotMatch(migration,/safe_metadata[\s\S]{0,300}'reason',v_reason/i);
  assert.match(api,/raw_handoff_reason_stored:false/);
});

test('tenant RLS is explicitly correlated to the outer owner-memory table',()=>{
  assert.match(migration,/m\.business_id=public\.dabbir_owner_decision_observations\.business_id/);
  assert.match(migration,/m\.business_id=public\.dabbir_owner_policy_versions\.business_id/);
  assert.match(migration,/m\.business_id=public\.dabbir_owner_policy_audit\.business_id/);
  assert.match(migration,/m\.role='owner'/);
});

test('owner API requires owner membership and same-origin for every mutation',()=>{
  assert.match(api,/membership\.role!=='owner'/);
  assert.match(api,/requireSameOrigin\(req\)/);
  assert.match(api,/activation_requires_explicit_owner_confirmation:true/);
  assert.match(api,/observation_threshold:3/);
  assert.doesNotMatch(api,/service_role|SUPABASE_SERVICE/i);
});

test('owner can activate, pause, resume and permanently revoke from the UI',()=>{
  assert.match(ui,/دع دبّر يتولى هذا النوع/);
  assert.match(ui,/pause:'إيقاف مؤقت'/);
  assert.match(ui,/resume:'إعادة التفعيل'/);
  assert.match(ui,/revoke:'إلغاء نهائي'/);
  assert.match(ui,/مال والقانون والهوية وKYC مستبعدة/);
  assert.match(shell,/\/api\/dabbir-owner-decision-memory-ui/);
});
