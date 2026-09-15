import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {checkProviderAuthority} from '../scripts/check-ai-provider-authority.mjs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260914191000_dabbir_ai_provider_cost_registry_v1.sql',import.meta.url),'utf8');
const registry=JSON.parse(fs.readFileSync(new URL('../config/ai-provider-authority-registry.json',import.meta.url),'utf8'));
const budget=fs.readFileSync(new URL('../api/_dabbir-ai-budget.js',import.meta.url),'utf8');
const rag=fs.readFileSync(new URL('../api/_dabbir-knowledge-rag.js',import.meta.url),'utf8');

test('reliability V3 and direct cost-provider semantics coexist without conflation',()=>{
  assert.equal(registry.version,'DABBIR_AI_PROVIDER_RELIABILITY_AUTHORITY_V3');
  assert.equal(registry.cost_registry_version,'DABBIR_AI_PROVIDER_COST_REGISTRY_V1');
  assert.deepEqual(registry.providers,['google-gemini','groq','cloudflare-workers-ai','vercel-ai-gateway']);
  assert.deepEqual(registry.direct_providers,['google-gemini','groq','cloudflare-workers-ai']);
  assert.equal(registry.gateway_provider,'vercel-ai-gateway');
  assert.equal(registry.background_recovery.attempt_type,'RECOVERY_PROBE');
  assert.equal(registry.cost_policy.hard_monthly_budget_aed,300);
  assert.equal(registry.cost_policy.unpriced_direct_usage,'FAIL_CLOSED_BEFORE_PAID_FALLBACK');
  for(const provider of [...registry.direct_providers,registry.gateway_provider]){
    assert.ok(Array.isArray(registry.cost_capabilities[provider]));
    assert.ok(registry.cost_capabilities[provider].length>0);
    for(const capability of registry.cost_capabilities[provider])assert.match(migration,new RegExp(capability.replaceAll('.','\\.')));
  }
});

test('paid-equivalent registry pins current direct model pricing and explicitly separates it from invoice truth',()=>{
  for(const token of [
    "'google-gemini','model','gemini-3.7-flash'",
    "'input_usd_per_million',0.75",
    "'output_usd_per_million',3.75",
    "'google-gemini','model','gemini-embedding-2'",
    "'input_usd_per_million',0.20",
    "'groq','model','openai/gpt-oss-20b'",
    "'input_usd_per_million',0.075",
    "'output_usd_per_million',0.30",
    "'cloudflare-workers-ai','model','@cf/zai-org/glm-4.7-flash'",
    "'input_usd_per_million',0.06",
    "'output_usd_per_million',0.40",
    "'audio_usd_per_minute',0.00051",
    "'paid_equivalent_not_invoice'",
    'ai_budget_exposure_microusd',
    'Historical invoice truth remains unchanged',
  ])assert.ok(migration.includes(token),`missing ${token}`);
});

test('direct provider meter prices token exposure conservatively and reserves unknown-duration audio',()=>{
  assert.match(migration,/PAID_EQUIVALENT_REGISTRY_ESTIMATE_V1/);
  assert.match(migration,/CONSERVATIVE_REGISTRY_RESERVE_V1/);
  assert.match(migration,/v_input\*v_in_rate\+v_output\*v_out_rate\+v_reasoning\*v_reason_rate/);
  assert.match(migration,/zero_usage_reserve_aed/);
  assert.match(migration,/provider_cost_registry_backfill/);
  assert.match(migration,/dabbir_ai_budget_exposure_monthly_v1/);
  assert.match(migration,/must not be presented as an invoice cost/);
});

test('Gemini knowledge embeddings enter the same direct-provider exposure ledger with a conservative byte upper bound',()=>{
  assert.match(rag,/dabbir_record_ai_usage_v1/);
  assert.match(rag,/p_provider:EMBEDDING_PROVIDER/);
  assert.match(rag,/p_model:DEFAULT_MODEL/);
  assert.match(rag,/p_cost_source:EMBEDDING_COST_SOURCE/);
  assert.match(rag,/EMBEDDING_USAGE_METER_UNVERIFIED/);
  assert.match(rag,/knowledge_retrieval_embedding/);
  assert.match(rag,/knowledge_index_embedding/);
  assert.match(rag,/Buffer\.byteLength/);
  assert.match(rag,/utf8_byte_upper_bound/);
});

test('paid budget reads separated direct exposure and fails closed on any unpriced direct operation',()=>{
  assert.match(budget,/directMonthlyExposureSpend/);
  assert.match(budget,/dabbir_ai_budget_exposure_monthly_v1/);
  assert.match(budget,/DIRECT_PROVIDER_SPEND_UNVERIFIED/);
  assert.match(budget,/fail_closed_on_unpriced_direct_provider_usage/);
  assert.match(budget,/gatewaySpend\.microusd/);
  assert.match(budget,/directSpend\?\.microusd/);
});

test('provider authority guard accepts recovery V3 plus direct and gateway cost bindings',()=>{
  const result=checkProviderAuthority(new URL('..',import.meta.url).pathname);
  assert.equal(result.ok,true,result.errors.join('\n'));
});
