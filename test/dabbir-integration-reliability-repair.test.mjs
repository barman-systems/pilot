import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDABBIRAiReply } from '../api/_dabbir-whatsapp-ai-meter.js';
import { EXTERNAL_READ_TOOLS } from '../api/_dabbir-autonomous-agent.js';
import { getDABBIRAiConfig } from '../api/_ai-core.js';

const aiCore=fs.readFileSync(new URL('../api/_ai-core.js',import.meta.url),'utf8');
const operator=fs.readFileSync(new URL('../api/_dabbir-autonomous-agent.js',import.meta.url),'utf8');
const registry=JSON.parse(fs.readFileSync(new URL('../config/runtime-registry.json',import.meta.url),'utf8'));

test('gateway keeps MiniMax primary but has a proven paid recovery model before legacy fallback',()=>{
  const config=getDABBIRAiConfig({VERCEL_ENV:'production'});
  assert.equal(config.model,'minimax/minimax-m3');
  assert.equal(config.cost_mode,'FREE_FIRST_WITH_PAID_GATEWAY_RECOVERY');
  assert.match(aiCore,/RECOVERY_GATEWAY_MODELS = \['openai\/gpt-5\.6-sol'\]/);
  assert.match(aiCore,/GATEWAY_PRIMARY_TIMEOUT_MS = 3000/);
  assert.match(aiCore,/\.\.\.RECOVERY_GATEWAY_MODELS/);
});

test('first 429 without Retry-After immediately cools the direct provider',async()=>{
  const calls=[];
  const env={GEMINI_API_KEY:'repair-gemini-429',GROQ_API_KEY:'repair-groq-429'};
  const fetchImpl=async url=>{
    const endpoint=String(url);calls.push(endpoint);
    if(endpoint.includes('generativelanguage.googleapis.com'))return new Response('{}',{status:429});
    return new Response(JSON.stringify({model:'openai/gpt-oss-20b',choices:[{message:{content:'ok'}}]}),{status:200});
  };
  const first=await generateDABBIRAiReply({project:'dabbir_businesses',message:'first',env,fetchImpl});
  assert.equal(first.ok,true);
  assert.equal(first.telemetry.attempts[0].status,429);
  assert.equal(first.telemetry.attempts[0].cooldown_ms,60_000);
  calls.length=0;
  const second=await generateDABBIRAiReply({project:'dabbir_businesses',message:'second',env,fetchImpl});
  assert.equal(second.ok,true);
  assert.equal(calls.some(x=>x.includes('generativelanguage.googleapis.com')),false);
  assert.ok(second.telemetry.skipped_attempts.some(x=>x.provider==='google-gemini'&&x.reason==='PROVIDER_429_COOLDOWN'));
});

test('direct network failure opens a short circuit instead of paying the timeout again',async()=>{
  const calls=[];
  const env={GEMINI_API_KEY:'repair-gemini-network',GROQ_API_KEY:'repair-groq-network'};
  const fetchImpl=async url=>{
    const endpoint=String(url);calls.push(endpoint);
    if(endpoint.includes('generativelanguage.googleapis.com'))throw new Error('simulated network failure');
    return new Response(JSON.stringify({model:'openai/gpt-oss-20b',choices:[{message:{content:'ok'}}]}),{status:200});
  };
  const first=await generateDABBIRAiReply({project:'dabbir_businesses',message:'first',env,fetchImpl});
  assert.equal(first.ok,true);
  assert.equal(first.telemetry.attempts[0].cooldown_ms,60_000);
  calls.length=0;
  const second=await generateDABBIRAiReply({project:'dabbir_businesses',message:'second',env,fetchImpl});
  assert.equal(second.ok,true);
  assert.equal(calls.some(x=>x.includes('generativelanguage.googleapis.com')),false);
});

test('Business Operator can use live web research without turning external evidence into tenant truth',()=>{
  assert.deepEqual(EXTERNAL_READ_TOOLS,['research_web']);
  assert.match(operator,/runVercelLiveResearch/);
  assert.match(operator,/truth=external_live_evidence/);
  assert.match(operator,/external_evidence/);
  assert.match(operator,/never overrides tenant data/);
});

test('runtime registry states proved integrations and keeps unproved ones closed',()=>{
  assert.equal(registry.version,3);
  assert.equal(registry.ai.live_research,'E2E_VERIFIED_READ');
  assert.equal(registry.integrations.exa_live_research,'E2E_VERIFIED_READ');
  assert.equal(registry.integrations.composio,'DISABLED_FAIL_CLOSED');
  assert.equal(registry.integrations.stripe,'SANDBOX_ONLY');
  assert.equal(registry.integrations.google_maps,'UNCONFIRMED');
  assert.match(registry.channels.whatsapp,/^NOT_OPERATIONAL/);
});
