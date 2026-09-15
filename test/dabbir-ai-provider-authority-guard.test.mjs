import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  checkProviderAuthority,
  detectDirectProviderTransport,
  validateRoutingAuthorityContract,
} from '../scripts/check-ai-provider-authority.mjs';

const registry=JSON.parse(fs.readFileSync(new URL('../config/ai-provider-authority-registry.json',import.meta.url),'utf8'));
const routingSources={
  [registry.routing_readiness_authority]:fs.readFileSync(new URL(`../${registry.routing_readiness_authority}`,import.meta.url),'utf8'),
  'api/_ai-core.js':fs.readFileSync(new URL('../api/_ai-core.js',import.meta.url),'utf8'),
  'api/dabbir-ai.js':fs.readFileSync(new URL('../api/dabbir-ai.js',import.meta.url),'utf8'),
};

function routingMutation(mutator){
  const candidate=structuredClone(registry);
  mutator(candidate);
  return validateRoutingAuthorityContract(candidate,routingSources);
}

test('current repository has one provider reliability authority with one truthful routing-readiness contract',()=>{
  const result=checkProviderAuthority();
  assert.equal(result.ok,true,result.errors.join('\n'));
  assert.ok(result.scanned_api_files>0);
  assert.match(result.registry_version,/^DABBIR_AI_PROVIDER_RELIABILITY_AUTHORITY_V[1-9]\d*$/);
  assert.deepEqual(result.routing_contract,{
    readiness_authority:'api/_ai-provider-readiness.js',
    primary:'vercel-ai-gateway',
    gemini_generation_recovery_production_state:'RETIRED',
    diagnostic_credentials_do_not_imply_recovery:true,
  });
});

test('authority version increments cannot break the guard while routing semantics remain unchanged',()=>{
  const future=structuredClone(registry);
  future.version='DABBIR_AI_PROVIDER_RELIABILITY_AUTHORITY_V999';
  assert.deepEqual(validateRoutingAuthorityContract(future,routingSources),[]);
});

test('routing mutation guard rejects split readiness, credential recovery, Gemini revival, or legacy public health',()=>{
  const cases=[
    [r=>{r.automatic_generation_routing.direct_recovery_readiness='api/_ai-core.js';},/single routing readiness authority/],
    [r=>{r.automatic_generation_routing.diagnostic_credentials_do_not_imply_recovery=false;},/diagnostic credentials must not imply/],
    [r=>{r.automatic_generation_routing.gemini_generation_recovery_production_state='ACTIVE';},/Gemini automatic generation recovery must remain retired/],
    [r=>{r.invariants.configured_credential_counts_as_automatic_recovery=true;},/configured credentials cannot count/],
    [r=>{r.invariants.health_readiness_uses_routing_readiness_authority=false;},/public health\/readiness must use/],
  ];
  for(const [mutate,pattern] of cases){
    const errors=routingMutation(mutate);
    assert.ok(errors.some(error=>pattern.test(error)),errors.join('\n'));
  }

  const legacySources={...routingSources,'api/dabbir-ai.js':routingSources['api/dabbir-ai.js']+'\ngetDABBIRAiRedundancy();'};
  const errors=validateRoutingAuthorityContract(registry,legacySources);
  assert.ok(errors.some(error=>/legacy credential-count redundancy authority/.test(error)),errors.join('\n'));
});

test('mutation guard rejects a new direct model transport even when the endpoint is hidden behind a constant',()=>{
  const samples=[
    "const GATEWAY_ENDPOINT='https://ai-gateway.vercel.sh/v1/chat/completions'; await fetch(GATEWAY_ENDPOINT,{method:'POST'});",
    "const GROQ_ENDPOINT='https://api.groq.com/openai/v1/chat/completions'; await fetchImpl(GROQ_ENDPOINT,{});",
    "const endpoint='https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'; await fetchBounded(endpoint,{});",
    "await fetch('https://api.cloudflare.com/client/v4/accounts/a/ai/run/model',{});",
    "await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent',{});",
  ];
  for(const source of samples)assert.equal(detectDirectProviderTransport(source),true,source);
});

test('billing/report APIs, ordinary fetches and authority-mediated model calls are not false positives',()=>{
  assert.equal(detectDirectProviderTransport("await fetch('https://api.github.com/repos/a/b')"),false);
  assert.equal(detectDirectProviderTransport("await fetch('https://ai-gateway.vercel.sh/v1/report?group_by=user')"),false);
  assert.equal(detectDirectProviderTransport("const GATEWAY_ENDPOINT='https://ai-gateway.vercel.sh/v1/chat/completions'; await authorityFetch(GATEWAY_ENDPOINT,{})"),false);
});
