import assert from 'node:assert/strict';
import test from 'node:test';
import { generateDABBIRAiReply, getDABBIRAiConfig } from '../api/_ai-core.js';
import { DIRECT_CLOUDFLARE_MODEL, operatorModelCandidates } from '../api/_dabbir-autonomous-agent.js';

test('Cloudflare Workers AI config uses GLM-4.7-Flash through the OpenAI-compatible endpoint',()=>{
  const config=getDABBIRAiConfig({CLOUDFLARE_API_TOKEN:'cf-token',CLOUDFLARE_ACCOUNT_ID:'account-123'});
  assert.equal(config.provider,'cloudflare-workers-ai');
  assert.equal(config.model,'@cf/zai-org/glm-4.7-flash');
  assert.equal(config.endpoint,'https://api.cloudflare.com/client/v4/accounts/account-123/ai/v1/chat/completions');
  assert.equal(config.cost_mode,'FREE_TIER_FIRST');
});

test('Cloudflare Workers AI can serve a grounded DABBIR reply',async()=>{
  let call;
  const result=await generateDABBIRAiReply({project:'dabbir_businesses',message:'مرحبا',language:'ar',businessContext:'Business name: Test',env:{CLOUDFLARE_API_TOKEN:'cf-token',CLOUDFLARE_ACCOUNT_ID:'account-123'},fetchImpl:async(url,options)=>{call={url:String(url),options};return new Response(JSON.stringify({model:'@cf/zai-org/glm-4.7-flash',choices:[{message:{content:'أهلًا، كيف أساعدك؟'}}]}),{status:200,headers:{'content-type':'application/json'}})}});
  assert.equal(result.ok,true);assert.equal(result.provider,'cloudflare-workers-ai');assert.equal(call.url,'https://api.cloudflare.com/client/v4/accounts/account-123/ai/v1/chat/completions');assert.equal(call.options.headers.authorization,'Bearer cf-token');assert.equal(JSON.parse(call.options.body).model,'@cf/zai-org/glm-4.7-flash');
});

test('Groq rate limit falls through to Cloudflare Workers AI before the gateway',async()=>{
  const calls=[];
  const result=await generateDABBIRAiReply({project:'dabbir_businesses',message:'مرحبا',language:'ar',env:{GROQ_API_KEY:'groq-token',CLOUDFLARE_API_TOKEN:'cf-token',CLOUDFLARE_ACCOUNT_ID:'account-123'},fetchImpl:async(url)=>{calls.push(String(url));if(String(url).includes('api.groq.com'))return new Response('{}',{status:429});return new Response(JSON.stringify({choices:[{message:{content:'تم'}}]}),{status:200,headers:{'content-type':'application/json'}})}});
  assert.equal(result.ok,true);assert.equal(result.provider,'cloudflare-workers-ai');assert.equal(calls.length,2);assert.match(calls[0],/api\.groq\.com/);assert.match(calls[1],/api\.cloudflare\.com/);
});

test('autonomous operator places Cloudflare after direct free providers and before Vercel gateway',()=>{
  const candidates=operatorModelCandidates({GEMINI_API_KEY:'gemini',GROQ_API_KEY:'groq',CLOUDFLARE_API_TOKEN:'cf-token',CLOUDFLARE_ACCOUNT_ID:'account-123'});
  assert.deepEqual(candidates.map(item=>item.name),['gemini-direct','groq-direct','cloudflare-workers-ai','vercel-gateway']);
  assert.equal(candidates[2].modelId,DIRECT_CLOUDFLARE_MODEL);
});
