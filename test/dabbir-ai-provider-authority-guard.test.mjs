import test from 'node:test';
import assert from 'node:assert/strict';
import {checkProviderAuthority,detectDirectProviderTransport} from '../scripts/check-ai-provider-authority.mjs';

test('current repository has one provider reliability authority with no unregistered inference bypass',()=>{
  const result=checkProviderAuthority();
  assert.equal(result.ok,true,result.errors.join('\n'));
  assert.ok(result.scanned_api_files>0);
  assert.equal(result.registry_version,'DABBIR_AI_PROVIDER_RELIABILITY_AUTHORITY_V2');
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