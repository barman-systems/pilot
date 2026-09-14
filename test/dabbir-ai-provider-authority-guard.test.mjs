import test from 'node:test';
import assert from 'node:assert/strict';
import {checkProviderAuthority,detectDirectProviderTransport} from '../scripts/check-ai-provider-authority.mjs';

test('current repository has one provider reliability authority with no unregistered bypass',()=>{
  const result=checkProviderAuthority();
  assert.equal(result.ok,true,result.errors.join('\n'));
  assert.ok(result.scanned_api_files>0);
  assert.equal(result.registry_version,'DABBIR_AI_PROVIDER_RELIABILITY_AUTHORITY_V1');
});

test('mutation guard rejects a new direct provider fetch even when the endpoint is hidden behind a constant',()=>{
  const samples=[
    "const GATEWAY_ENDPOINT='https://ai-gateway.vercel.sh/v1/chat/completions'; await fetch(GATEWAY_ENDPOINT,{method:'POST'});",
    "const GROQ_ENDPOINT='https://api.groq.com/openai/v1/chat/completions'; await fetchImpl(GROQ_ENDPOINT,{});",
    "const endpoint='https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'; await fetchBounded(endpoint,{});",
    "await fetch('https://api.cloudflare.com/client/v4/accounts/a/ai/run/model',{});",
  ];
  for(const source of samples)assert.equal(detectDirectProviderTransport(source),true,source);
});

test('ordinary non-provider fetches and authority-mediated calls are not false positives',()=>{
  assert.equal(detectDirectProviderTransport("await fetch('https://api.github.com/repos/a/b')"),false);
  assert.equal(detectDirectProviderTransport("const GATEWAY_ENDPOINT='https://ai-gateway.vercel.sh/v1/chat/completions'; await authorityFetch(GATEWAY_ENDPOINT,{})"),false);
});
