import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateDABBIRAiReply} from '../api/_dabbir-whatsapp-ai-meter.js';

const voice=fs.readFileSync(new URL('../api/_dabbir-whatsapp-voice.js',import.meta.url),'utf8');
const daily=fs.readFileSync(new URL('../api/_dabbir-daily-operator-reliable.js',import.meta.url),'utf8');
const meter=fs.readFileSync(new URL('../api/_dabbir-whatsapp-ai-meter.js',import.meta.url),'utf8');

const BUSINESS_ID='11111111-1111-4111-8111-111111111111';
const CONVERSATION_ID='22222222-2222-4222-8222-222222222222';
const meteringContext={business:{id:BUSINESS_ID},conversation:{id:CONVERSATION_ID},batch_message_created_at:'2026-09-14T12:00:00.000Z'};
const directProviderResponse=()=>new Response(JSON.stringify({model:'openai/gpt-oss-20b',choices:[{message:{content:'ok'}}],usage:{prompt_tokens:10,completion_tokens:3}}),{status:200,headers:{'content-type':'application/json'}});

test('voice direct AI must be metered before transcript finalization',()=>{
  assert.match(voice,/VOICE_USAGE_METER_UNVERIFIED/);
  assert.match(voice,/if\(receipt\?\.ok!==true\)throw errorWithCode\('VOICE_USAGE_METER_UNVERIFIED'/);
  const meterAt=voice.indexOf('await recordVoiceUsage(claim,transcription,media.bytes.length)');
  const finalizeAt=voice.indexOf("serviceRpc('dabbir_whatsapp_voice_finalize'");
  assert.ok(meterAt>0&&finalizeAt>meterAt,'voice usage receipt must precede transcript finalization');
  const recordBlock=voice.slice(voice.indexOf('async function recordVoiceUsage'),voice.indexOf('function clarificationText'));
  assert.doesNotMatch(recordBlock,/catch\(\(\)=>null\)/);
});

test('daily operator discards an unmetered direct enhancement and keeps deterministic authority',()=>{
  assert.match(daily,/recordDirectEnhancementUsage/);
  assert.match(daily,/FREE_DIRECT_METER_VERIFIED/);
  assert.match(daily,/FREE_DIRECT_METER_UNVERIFIED/);
  assert.match(daily,/reason:'AI_USAGE_METER_UNVERIFIED'/);
  assert.match(daily,/ok:false/);
  assert.match(daily,/runCoreDailyBusinessReview\(\{\.\.\.authorityArgs,enhance:meteredEnhance\}\)/);
});

test('WhatsApp direct provider success becomes failure when usage receipt is unavailable',async()=>{
  const result=await generateDABBIRAiReply({
    project:'dabbir_businesses',message:'hello',meteringContext,providerHealthStore:null,
    env:{GROQ_API_KEY:'provider-test-key',SUPABASE_SERVICE_ROLE_KEY:'service-test-key'},
    fetchImpl:async()=>directProviderResponse(),
    meterFetchImpl:async()=>new Response('{}',{status:503}),
  });
  assert.equal(result.provider,'groq');
  assert.equal(result.ok,false);
  assert.equal(result.state,'PROVIDER_ERROR');
  assert.equal(result.error,'AI_USAGE_METER_UNVERIFIED');
  assert.equal(result.reply,null);
  assert.equal(result.telemetry.usage_meter.state,'DIRECT_PROVIDER_RESULT_REJECTED');
});

test('malformed HTTP 200 meter receipt cannot authorize a direct provider result',async()=>{
  const result=await generateDABBIRAiReply({
    project:'dabbir_businesses',message:'hello',meteringContext,providerHealthStore:null,
    env:{GROQ_API_KEY:'provider-test-key',SUPABASE_SERVICE_ROLE_KEY:'service-test-key'},
    fetchImpl:async()=>directProviderResponse(),
    meterFetchImpl:async()=>new Response('{}',{status:200,headers:{'content-type':'application/json'}}),
  });
  assert.equal(result.ok,false);
  assert.equal(result.error,'AI_USAGE_METER_UNVERIFIED');
});

test('verified meter receipt preserves direct provider success',async()=>{
  let recorded=null;
  const result=await generateDABBIRAiReply({
    project:'dabbir_businesses',message:'hello',meteringContext,providerHealthStore:null,
    env:{GROQ_API_KEY:'provider-test-key',SUPABASE_SERVICE_ROLE_KEY:'service-test-key'},
    fetchImpl:async()=>directProviderResponse(),
    meterFetchImpl:async(_url,options)=>{
      recorded=JSON.parse(options.body);
      return new Response(JSON.stringify({ok:true,outcome_id:'33333333-3333-4333-8333-333333333333'}),{status:200,headers:{'content-type':'application/json'}});
    },
  });
  assert.equal(result.ok,true);
  assert.equal(result.provider,'groq');
  assert.equal(result.reply,'ok');
  assert.equal(result.telemetry.usage_meter.state,'VERIFIED');
  assert.equal(recorded.p_business_id,BUSINESS_ID);
  assert.equal(recorded.p_provider,'groq');
  assert.equal(recorded.p_input_tokens,10);
  assert.equal(recorded.p_output_tokens,3);
});

test('customer AI meter never converts unreadable receipt into synthetic success',()=>{
  assert.doesNotMatch(meter,/response\.json\(\)\.catch\(\(\)=>\(\{ok:true\}\)\)/);
  assert.match(meter,/if\(receipt\?\.ok!==true\)throw new Error\('AI_USAGE_METER_UNVERIFIED'\)/);
  assert.match(meter,/state:'DIRECT_PROVIDER_RESULT_REJECTED'/);
});
