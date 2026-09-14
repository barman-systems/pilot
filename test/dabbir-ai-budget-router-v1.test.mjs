import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  AED_PER_USD,
  DEFAULT_AI_RESERVATION_AED,
  aedToMicrousd,
  budgetPressure,
  claimAiBudget,
  reservationAedForOperation,
} from '../api/_dabbir-ai-budget.js';
import {
  BUDGET_SAVER_MODEL,
  PAID_OPERATOR_MODEL,
  operatorModelCandidates,
} from '../api/_dabbir-autonomous-agent.js';

const usdForAed = aed => aed / AED_PER_USD;

test('operator planning reservation is dynamic and materially below the legacy 5 AED hold',()=>{
  assert.equal(DEFAULT_AI_RESERVATION_AED,1);
  const reserve=reservationAedForOperation({operationType:'operator.ai_planning',maxOutputTokens:320,maxSteps:6,autonomous:false});
  assert.equal(reserve,0.94);
  assert.ok(reserve<5);
});

test('budget pressure bands preserve the 300 AED hard ceiling while degrading paid routing early',()=>{
  assert.equal(budgetPressure({spentUsd:usdForAed(179),budgetAed:300}).band,'NORMAL');
  assert.equal(budgetPressure({spentUsd:usdForAed(180),budgetAed:300}).band,'CONSERVE');
  assert.equal(budgetPressure({spentUsd:usdForAed(240),budgetAed:300}).band,'RESTRICT');
  const protectedState=budgetPressure({spentUsd:usdForAed(270),budgetAed:300});
  assert.equal(protectedState.band,'PROTECT');
  assert.equal(protectedState.paid_allowed,false);
  assert.equal(protectedState.premium_allowed,false);
});

test('claimAiBudget uses the dynamic reservation and returns pressure evidence',async()=>{
  let params=null;
  const result=await claimAiBudget({
    businessId:'00000000-0000-4000-8000-000000000001',
    operationKey:'operator.ai_planning:test-dynamic-reserve',
    operationType:'operator.ai_planning',
    autonomous:false,
    maxOutputTokens:320,
    maxSteps:6,
    gatewayClient:{getSpendReport:async()=>({results:[{totalCost:1}]})},
    rpc:async(name,value)=>{assert.equal(name,'dabbir_claim_ai_budget_v1');params=value;return {allowed:true,reserve_microusd:value.p_reserve_microusd};},
  });
  assert.equal(result.allowed,true);
  assert.equal(result.reservation_aed,0.94);
  assert.equal(params.p_reserve_microusd,aedToMicrousd(0.94));
  assert.equal(result.budget_pressure.band,'NORMAL');
});

test('protection band blocks a paid reservation before the ledger is mutated',async()=>{
  let rpcCalled=false;
  const result=await claimAiBudget({
    businessId:'00000000-0000-4000-8000-000000000001',
    operationKey:'operator.ai_planning:test-protect',
    operationType:'operator.ai_planning',
    gatewayClient:{getSpendReport:async()=>({results:[{totalCost:usdForAed(270)}]})},
    rpc:async()=>{rpcCalled=true;throw new Error('must not reserve');},
  });
  assert.equal(result.allowed,false);
  assert.equal(result.reason,'BUDGET_PROTECTION');
  assert.equal(result.budget_pressure.band,'PROTECT');
  assert.equal(rpcCalled,false);
});

test('default candidate contract stays compatible while free-only mode omits the paid gateway',()=>{
  const env={GEMINI_API_KEY:'gemini',GROQ_API_KEY:'groq',CLOUDFLARE_API_TOKEN:'cf',CLOUDFLARE_ACCOUNT_ID:'acct'};
  assert.deepEqual(operatorModelCandidates(env).map(x=>x.name),['gemini-direct','groq-direct','cloudflare-workers-ai','vercel-gateway']);
  assert.deepEqual(operatorModelCandidates(env,{includePaid:false}).map(x=>x.name),['gemini-direct','groq-direct','cloudflare-workers-ai']);
});

test('paid routing becomes cheaper as pressure rises and never uses premium fallback in conserve/restrict modes',()=>{
  const env={
    DABBIR_AI_GATEWAY_MODEL:'openai/gpt-5.4',
    DABBIR_AI_BUDGET_SAVER_MODEL:'google/gemini-3-flash',
    DABBIR_AI_GATEWAY_FALLBACK_MODELS:'anthropic/claude-sonnet-4.6,google/gemini-3-flash,openai/gpt-5.4-nano',
  };
  const normal=operatorModelCandidates(env,{includeFree:false,budgetPressure:'NORMAL'})[0];
  assert.equal(normal.modelId,'openai/gpt-5.4');
  assert.ok(normal.providerOptions.gateway.models.includes('anthropic/claude-sonnet-4.6'));
  const conserve=operatorModelCandidates(env,{includeFree:false,budgetPressure:'CONSERVE'})[0];
  assert.equal(conserve.modelId,'google/gemini-3-flash');
  assert.deepEqual(conserve.providerOptions.gateway.models,['openai/gpt-5.4-nano']);
  const restrict=operatorModelCandidates(env,{includeFree:false,budgetPressure:'RESTRICT'})[0];
  assert.equal(restrict.modelId,'google/gemini-3-flash');
  assert.deepEqual(restrict.providerOptions.gateway.models,[]);
  assert.equal(operatorModelCandidates(env,{includeFree:false,budgetPressure:'PROTECT'}).length,0);
  assert.equal(BUDGET_SAVER_MODEL,process.env.DABBIR_AI_BUDGET_SAVER_MODEL||'google/gemini-3-flash');
  assert.equal(PAID_OPERATOR_MODEL,process.env.DABBIR_AI_GATEWAY_MODEL||'openai/gpt-5.4');
});

test('operator source proves free candidates run before any paid budget claim',()=>{
  const source=fs.readFileSync(new URL('../api/_dabbir-autonomous-agent.js',import.meta.url),'utf8');
  const freeAttempt=source.indexOf("operatorModelCandidates(process.env,{includePaid:false})");
  const paidClaim=source.indexOf("budget=await claimAiBudget({businessId");
  assert.ok(freeAttempt>=0);
  assert.ok(paidClaim>freeAttempt);
  assert.match(source,/AI_BUDGET_PROTECTION_ACTIVE/);
  assert.match(source,/PAID_MODEL_BUDGET_ROUTER_V1_/);
  assert.match(source,/FREE_DIRECT_PROVIDER/);
});
