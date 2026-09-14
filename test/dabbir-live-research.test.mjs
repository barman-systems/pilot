import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gateway } from 'ai';
import { extractResearchSources, normalizeResearchInput, runVercelLiveResearch } from '../api/_dabbir-live-research.js';

const route=fs.readFileSync(new URL('../api/dabbir-live-research.js',import.meta.url),'utf8');

test('AI SDK exposes Vercel Gateway Exa search tool',()=>{
  assert.equal(typeof gateway?.tools?.exaSearch,'function');
});

test('research input is bounded and domain-scoped',()=>{
  assert.deepEqual(normalizeResearchInput({query:'  UAE market  ',num_results:999,include_domains:['https://www.vercel.com/docs/x','bad domain','openai.com'],category:'news'}),{
    query:'UAE market',numResults:12,domains:['vercel.com','openai.com'],category:'news'
  });
});

test('source extraction deduplicates URLs from gateway results',()=>{
  const sources=extractResearchSources({
    sources:[{url:'https://vercel.com/docs/ai-gateway',title:'Gateway'}],
    staticToolResults:[{output:{results:[{url:'https://vercel.com/docs/ai-gateway/',title:'Duplicate'},{url:'https://exa.ai',title:'Exa'}]}}],
  });
  assert.deepEqual(sources,[{url:'https://vercel.com/docs/ai-gateway',title:'Gateway'},{url:'https://exa.ai',title:'Exa'}]);
});

test('research call forces Exa and fails closed without source evidence',async()=>{
  let request=null;
  const fakeGateway={tools:{exaSearch:options=>({providerDefined:true,options})}};
  await assert.rejects(
    runVercelLiveResearch({query:'test',num_results:3},{gateway:fakeGateway,generateText:async input=>{request=input;return {text:'answer without evidence',sources:[],staticToolResults:[],steps:[]}}}),
    /LIVE_RESEARCH_NO_SOURCE_EVIDENCE/
  );
  assert.equal(request.toolChoice.type,'tool');
  assert.equal(request.toolChoice.toolName,'exa_search');
  assert.equal(request.tools.exa_search.options.numResults,3);
  assert.equal(request.providerOptions.gateway.disallowPromptTraining,true);
});

test('research returns external evidence, never verified tenant truth',async()=>{
  const fakeGateway={tools:{exaSearch:options=>({providerDefined:true,options})}};
  const result=await runVercelLiveResearch({query:'current docs'},{gateway:fakeGateway,generateText:async()=>({text:'Found it',sources:[{url:'https://vercel.com/docs/ai-gateway/models-and-providers/web-search',title:'Web Search'}]})});
  assert.equal(result.ok,true);
  assert.equal(result.truth,'external_live_evidence');
  assert.equal(result.source,'vercel_ai_gateway_exa');
  assert.equal(result.provider_tool,'exa_search');
  assert.equal(result.source_count,1);
  assert.equal(result.values_exposed,false);
});

test('live research route is owner-scoped, same-origin and read-only',()=>{
  assert.match(route,/req\.method!=='POST'/);
  assert.match(route,/requireSameOrigin\(req\)/);
  assert.match(route,/getVerifiedUser\(token\)/);
  assert.match(route,/getBusinessMemberships\(token\)/);
  assert.match(route,/membership\.role\|\|''\)\.toLowerCase\(\)!=='owner'/);
  assert.match(route,/access_scope:'owner_tenant_read_only'/);
  assert.doesNotMatch(route,/SUPABASE_SERVICE_ROLE_KEY|API_KEY|SECRET|TOKEN/);
});
