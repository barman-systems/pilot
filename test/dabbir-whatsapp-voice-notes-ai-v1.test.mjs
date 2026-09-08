import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { transcribeWhatsAppVoiceAudio } from '../api/_dabbir-whatsapp-voice.js';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260908012924_dabbir_whatsapp_voice_notes_ai_v1.sql',import.meta.url),'utf8');
const webhook=fs.readFileSync(new URL('../api/dabbir-whatsapp-webhook.js',import.meta.url),'utf8');
const voice=fs.readFileSync(new URL('../api/_dabbir-whatsapp-voice.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../api/dabbir-whatsapp-voice-worker.js',import.meta.url),'utf8');
const cron=fs.readFileSync(new URL('../api/dabbir-whatsapp-ai-cron.js',import.meta.url),'utf8');

const must=(source,pattern,message)=>assert.match(source,pattern,message);

test('voice ingest is durable, tenant scoped and service-role only',()=>{
  must(migration,/create table if not exists public\.dabbir_whatsapp_voice_ingest/i);
  must(migration,/unique \(business_id,provider_message_id\)/i);
  must(migration,/foreign key \(business_id,conversation_id\)[\s\S]*dabbir_conversations\(business_id,id\)/i);
  must(migration,/alter table public\.dabbir_whatsapp_voice_ingest enable row level security/i);
  must(migration,/revoke all on table public\.dabbir_whatsapp_voice_ingest from public,anon,authenticated/i);
  must(migration,/grant select,insert,update,delete on table public\.dabbir_whatsapp_voice_ingest to service_role/i);
  for(const name of [
    'dabbir_whatsapp_persist_voice_inbound',
    'dabbir_whatsapp_voice_claim_dispatch',
    'dabbir_whatsapp_voice_claim_next',
    'dabbir_whatsapp_voice_finalize',
    'dabbir_whatsapp_voice_complete_clarification',
    'dabbir_whatsapp_voice_fail',
  ]){
    must(migration,new RegExp(`create or replace function public\\.${name}\\(`,'i'));
    must(migration,new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]+?from public,anon,authenticated`,'i'));
  }
});

test('voice transcript cannot trigger business AI when confidence is uncertain',()=>{
  must(migration,/v_confidence<0\.82/i);
  must(migration,/v_uncertain:=coalesce\(p_needs_confirmation,false\)[\s\S]+v_confidence<0\.82/i);
  must(migration,/if not v_uncertain then[\s\S]+dabbir_enqueue_message_batch/i);
  must(migration,/intent,simulated\)[\s\S]+v_intent,false/i);
  must(migration,/VOICE_NOTE_UNCERTAIN/i);
  must(migration,/VOICE_NOTE_TRANSCRIPT/i);
  must(migration,/raw_audio_persisted',false/i);
  assert.doesNotMatch(migration,/\bbytea\b/i,'raw audio must not be stored as bytea');
});

test('signed Meta audio webhook is routed to durable voice ingestion',()=>{
  must(webhook,/message\.audio\?\.id/);
  must(webhook,/message\.audio\?\.mime_type/);
  must(webhook,/message\.audio\?\.voice === true/);
  must(webhook,/persistSignedVoiceInbound\(event\)/);
  must(webhook,/voice_message_count/);
  must(webhook,/verifyMetaSignature/);
});

test('voice worker fetches tenant scoped Meta media, bounds bytes and never logs transcript',()=>{
  must(voice,/loadConversationConnectionWithServiceKey\(key,claim\.business_id,claim\.conversation_id\)/);
  must(voice,/graph\.facebook\.com\/\$\{encodeURIComponent\(platform\.graphVersion\)\}\/\$\{encodeURIComponent\(mediaId\)\}/);
  must(voice,/authorization:`Bearer \$\{token\}`/);
  must(voice,/MAX_AUDIO_BYTES=12\*1024\*1024/);
  must(voice,/META_MEDIA_HOSTS/);
  must(voice,/redirect:'error'/);
  must(worker,/processWhatsAppVoiceDispatchToken/);
  assert.doesNotMatch(worker,/transcript/i,'worker logs/responses must not expose transcript text');
});

test('voice transcription uses Gemini audio understanding with Cloudflare Whisper fallback',()=>{
  must(voice,/inlineData:\{mimeType,data:audioBuffer\.toString\('base64'\)\}/);
  must(voice,/needs_confirmation/);
  must(voice,/@cf\/openai\/whisper-large-v3-turbo/);
  must(voice,/audio:audioBuffer\.toString\('base64'\)/);
  must(voice,/transcribeWithGemini[\s\S]+transcribeWithCloudflare/);
  must(voice,/wa-voice-clarify:\$\{claim\.voice_ingest_id\}/);
  must(voice,/dabbir_record_ai_usage_v1/);
  must(voice,/raw_audio_persisted:false/);
  must(voice,/request\.language=hint/);
  must(voice,/languageHint:tenantLanguage/);
});

test('voice recovery is non-blocking inside the existing WhatsApp recovery cron',()=>{
  must(cron,/processWhatsAppVoiceRecovery/);
  must(cron,/voiceRecoveryError=null/);
  must(cron,/dabbir_whatsapp_voice_recovery_failed/);
  must(cron,/voice_processed:voice\.processed/);
  must(cron,/voice_recovery_ok:voiceRecoveryError===null/);
  must(cron,/processWhatsAppRecoveryWithServiceMenu/);
});

test('Gemini transcription preserves Gulf Arabic and returns structured confidence',async()=>{
  let request=null;
  const fetchImpl=async(url,options)=>{
    request={url:String(url),options};
    return new Response(JSON.stringify({
      candidates:[{content:{parts:[{text:JSON.stringify({
        transcript:'أبا غسيل باجر الساعة خمس',language:'ar',confidence:0.94,needs_confirmation:false,uncertain_terms:[],
      })}]}}],
    }),{status:200,headers:{'content-type':'application/json'}});
  };
  const result=await transcribeWhatsAppVoiceAudio(Buffer.from('fake-audio'),'audio/ogg',{
    env:{GEMINI_API_KEY:'test-key',DABBIR_GEMINI_MODEL:'gemini-3.7-flash'},fetchImpl,languageHint:'ar',
  });
  assert.equal(result.transcript,'أبا غسيل باجر الساعة خمس');
  assert.equal(result.language,'ar');
  assert.equal(result.confidence,0.94);
  assert.equal(result.needsConfirmation,false);
  assert.equal(result.provider,'google-gemini');
  assert.match(request.url,/generativelanguage\.googleapis\.com/);
  const body=JSON.parse(request.options.body);
  assert.equal(body.contents[0].parts[1].inlineData.mimeType,'audio/ogg');
  assert.ok(body.contents[0].parts[1].inlineData.data.length>0);
});

test('Cloudflare Whisper is used when Gemini has a retryable provider failure',async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url:String(url),options});
    if(String(url).includes('generativelanguage.googleapis.com'))return new Response('{}',{status:503});
    return new Response(JSON.stringify({success:true,result:{text:'السلام عليكم'}}),{
      status:200,headers:{'content-type':'application/json'},
    });
  };
  const result=await transcribeWhatsAppVoiceAudio(Buffer.from('fake-audio'),'audio/ogg',{
    env:{
      GEMINI_API_KEY:'test-key',DABBIR_GEMINI_MODEL:'gemini-3.7-flash',
      CLOUDFLARE_API_TOKEN:'cf-test',CLOUDFLARE_ACCOUNT_ID:'acct-test',
    },fetchImpl,languageHint:'ar',
  });
  assert.equal(result.provider,'cloudflare-workers-ai');
  assert.equal(result.model,'@cf/openai/whisper-large-v3-turbo');
  assert.equal(result.transcript,'السلام عليكم');
  assert.equal(result.language,'ar');
  assert.equal(result.needsConfirmation,false);
  assert.equal(calls.length,2);
  assert.match(calls[1].url,/cloudflare\.com/);
  const body=JSON.parse(calls[1].options.body);
  assert.equal(body.language,'ar');
  assert.match(body.initial_prompt,/العربية الخليجية/);
});

test('Cloudflare tenant-language mismatch fails closed instead of executing hallucinated text',async()=>{
  const fetchImpl=async()=>new Response(JSON.stringify({success:true,result:{text:'This is not Arabic'}}),{
    status:200,headers:{'content-type':'application/json'},
  });
  const result=await transcribeWhatsAppVoiceAudio(Buffer.from('fake-audio'),'audio/ogg',{
    env:{CLOUDFLARE_API_TOKEN:'cf-test',CLOUDFLARE_ACCOUNT_ID:'acct-test'},fetchImpl,languageHint:'ar',
  });
  assert.equal(result.provider,'cloudflare-workers-ai');
  assert.equal(result.language,'en');
  assert.equal(result.needsConfirmation,true);
  assert.ok(result.confidence<0.82);
});
