import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  AED_PER_USD,
  DEFAULT_AI_RESERVATION_AED,
  aedToMicrousd,
  budgetPressure,
  claimAiBudget,
  directMonthlyExposureSpend,
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

test('direct provider monthly exposure is read from the service-role-only exposure view',async()=>{
  let requestUrl='';
  const result=await directMonthlyExposureSpend({
    env:{SUPABASE_SERVICE_ROLE_KEY:'service-role-test'},
    now:new Date('2026-09-14T12:00:00Z'),
    fetchImpl:async url=>{
      requestUrl=String(url);
      return new Response(JSON.stringify([
        {provider:'groq',exposure_microusd:2500,unpriced_operations:0},
        {provider:'google-gemini',exposure_microusd:7500,unpriced_operations:0},
      ]),{status:200,headers:{'content-type':'application/json'}});
    },
  });
  assert.equal(result.microusd,10000);
  assert.equal(result.usd,0.01);
  assert.equal(result.unpriced_operations,0);
  assert.match(requestUrl,/dabbir_ai_budget_exposure_monthly_v1/);
});

test('claimAiBudget combines gateway actual spend and direct paid-equivalent exposure',async()=>{
  let params=null;
  const result=await claimAiBudget({
    businessId:'00000000-0000-4000-8000-000000000001',
    operationKey:'operator.ai_planning:test-dynamic-reserve',
    operationType:'operator.ai_planning',
    autonomous:false,
    maxOutputTokens:320,
    maxSteps:6,
    gatewayClient:{getSpendReport:async()=>({results:[{totalCost:1}]})},
    directSpendReader:async()=>({usd:0.5,microusd:500000,unpriced_operations:0,providers:2}),
    rpc:async(name,value)=>{assert.equal(name,'dabbir_claim_ai_budget_v1');params=value;return {allowed:true,reserve_microusd:value.p_reserve_microusd};},
  });
  assert.equal(result.allowed,true);
  assert.equal(result.reservation_aed,0.94);
  assert.equal(params.p_reserve_microusd,aedToMicrousd(0.94));
  assert.equal(params.p_external_spent_microusd,1500000);
  assert.equal(result.external_spend_usd,1.5);
  assert.equal(result.gateway_spend_usd,1);
  assert.equal(result.direct_paid_equivalent_usd,0.5);
  assert.equal(result.budget_pressure.band,'NORMAL');
});

test('unpriced direct usage fails closed before a paid fallback can reserve budget',async()=>{
  let rpcCalled=false;
  const result=await claimAiBudget({
    businessId:'00000000-0000-4000-8000-000000000001',
    operationKey:'operator.ai_planning:test-unpriced-direct',
    operationType:'operator.ai_planning',
    gatewayClient:{getSpendReport:async()=>({results:[{totalCost:1}]})},
    directSpendReader:async()=>({usd:0.25,microusd:250000,unpriced_operations:1,providers:1}),
    rpc:async()=>{rpcCalled=true;throw new Error('must not reserve');},
  });
  assert.equal(result.allowed,false);
  assert.equal(result.reason,'DIRECT_PROVIDER_SPEND_UNVERIFIED');
  assert.equal(result.direct_unpriced_operations,1);
  assert.equal(rpcCalled,false);
});

test('protection band includes direct provider exposure and blocks paid reservation before ledger mutation',async()=>{
  let rpcCalled=false;
  const result=await claimAiBudget({
    businessId:'00000000-0000-4000-8000-000000000001',
    operationKey:'operator.ai_planning:test-protect',
    operationType:'operator.ai_planning',
    gatewayClient:{getSpendReport:async()=>({results:[{totalCost:usdForAed(260)}]})},
    directSpendReader:async()=>({usd:usdForAed(10),microusd:Math.ceil(usdForAed(10)*1_000_000),unpriced_operations:0,providers:2}),
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
