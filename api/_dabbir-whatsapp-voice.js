import { createHash } from 'node:crypto';
import { applyDabbirMetaPublicIdentifiers } from './_dabbir-meta-public-config.js';
import { embeddedPlatformConfig, openAccessToken } from './_whatsapp-embedded-core.js';
import { finalizeOutboundReply, markOutboundResult, sendMetaText, serviceRpc } from './_whatsapp-live-core.js';
import { loadConversationConnectionWithServiceKey } from './_whatsapp-service-connection.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_AUDIO_BYTES=12*1024*1024;
const GEMINI_TIMEOUT_MS=22000;
const META_TIMEOUT_MS=12000;
const CLOUDFLARE_TIMEOUT_MS=22000;
const CLOUDFLARE_STT_MODEL='@cf/openai/whisper-large-v3-turbo';
const META_MEDIA_HOSTS=['facebook.com','fbcdn.net','fbsbx.com','whatsapp.net'];
const TERMINAL_RESERVATION_STATES=new Set(['PROVIDER_ACCEPTED','SENT','DELIVERED','READ']);
const PERMANENT_VOICE_ERRORS=new Set([
  'VOICE_TRANSCRIPTION_NOT_CONFIGURED',
  'VOICE_AUDIO_TOO_LARGE',
  'VOICE_AUDIO_MIME_INVALID',
  'META_WHATSAPP_MEDIA_URL_UNTRUSTED',
  'META_WHATSAPP_MEDIA_METADATA_INVALID',
  'VOICE_TRANSCRIPT_EMPTY',
]);
const clean=(v,max=4000)=>String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
const one=v=>Array.isArray(v)?v[0]??null:v??null;
const hash=v=>createHash('sha256').update(String(v)).digest('hex');
const serviceKey=()=>clean(process.env.SUPABASE_SERVICE_ROLE_KEY,8192);

function occurredAt(timestamp){
  const seconds=Number(timestamp);
  if(!Number.isFinite(seconds)||seconds<=0)return new Date().toISOString();
  const date=new Date(seconds*1000);
  return Number.isFinite(date.getTime())?date.toISOString():new Date().toISOString();
}
function languageFromText(text,fallback='auto'){
  if(/[\u0600-\u06ff]/.test(String(text||'')))return 'ar';
  if(/[A-Za-z]/.test(String(text||'')))return 'en';
  const base=clean(fallback,20).toLowerCase();
  return base.startsWith('ar')?'ar':base.startsWith('en')?'en':'auto';
}
function languageHint(value='auto'){
  const base=clean(value,20).toLowerCase();
  return base.startsWith('ar')?'ar':base.startsWith('en')?'en':'auto';
}
function normalizeMime(value){
  const raw=clean(value,160).toLowerCase().split(';')[0].trim();
  if(!raw.startsWith('audio/'))return '';
  if(raw==='audio/x-m4a')return 'audio/m4a';
  if(raw==='audio/x-wav')return 'audio/wav';
  return raw;
}
function trustedMediaUrl(value){
  try{
    const url=new URL(String(value||''));
    if(url.protocol!=='https:')return null;
    const host=url.hostname.toLowerCase();
    if(!META_MEDIA_HOSTS.some(domain=>host===domain||host.endsWith(`.${domain}`)))return null;
    return url.toString();
  }catch{return null}
}
function parseJsonObject(text){
  const value=clean(text,8000).replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const a=value.indexOf('{'),b=value.lastIndexOf('}');
  if(a<0||b<=a)return null;
  try{const parsed=JSON.parse(value.slice(a,b+1));return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:null;}catch{return null}
}
function errorWithCode(code,extra={}){return Object.assign(new Error(code),{code,...extra})}

async function fetchBounded(url,options={},timeoutMs=12000,fetchImpl=fetch){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetchImpl(url,{...options,signal:controller.signal});}
  catch(error){if(error?.name==='AbortError')throw errorWithCode('VOICE_PROVIDER_TIMEOUT',{retryable:true});throw error;}
  finally{clearTimeout(timer)}
}

export async function persistSignedVoiceInbound(event){
  if(!event?.messageId||!event?.phoneNumberId||!event?.from||!event?.mediaId){
    throw errorWithCode('WHATSAPP_VOICE_EVENT_INCOMPLETE',{status:400});
  }
  const row=one(await serviceRpc('dabbir_whatsapp_persist_voice_inbound',{
    p_phone_number_id:clean(event.phoneNumberId,160),
    p_provider_message_id:clean(event.messageId,320),
    p_sender_handle:clean(event.from,160),
    p_display_name:clean(event.contactName,120)||null,
    p_media_id:clean(event.mediaId,320),
    p_claimed_mime_type:clean(event.mediaMimeType,160)||null,
    p_is_voice_note:event.voice===true,
    p_occurred_at:occurredAt(event.timestamp),
  }));
  if(!row?.voice_ingest_id||!row?.conversation_id)throw errorWithCode('WHATSAPP_VOICE_PERSISTENCE_UNVERIFIED',{status:502});
  return {persisted:true,duplicate:row.duplicate===true,voiceIngestId:row.voice_ingest_id,conversationId:row.conversation_id,state:clean(row.state,40)};
}

async function loadMetaAudio(claim,{env=process.env,fetchImpl=fetch}={}){
  const key=clean(env.SUPABASE_SERVICE_ROLE_KEY,8192)||serviceKey();
  if(!key)throw errorWithCode('WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED',{status:503});
  const connection=await loadConversationConnectionWithServiceKey(key,claim.business_id,claim.conversation_id);
  if(!connection||connection.status!=='connected')throw errorWithCode('WHATSAPP_TENANT_NOT_LINKED',{status:409});
  const platform=applyDabbirMetaPublicIdentifiers(embeddedPlatformConfig(env));
  const token=openAccessToken(connection,platform,claim.business_id);
  if(!token)throw errorWithCode('WHATSAPP_MEDIA_ACCESS_TOKEN_UNAVAILABLE',{status:503});
  const mediaId=clean(claim.media_id,320);
  if(!mediaId)throw errorWithCode('WHATSAPP_MEDIA_ID_REQUIRED',{status:400});

  const metadataResponse=await fetchBounded(
    `https://graph.facebook.com/${encodeURIComponent(platform.graphVersion)}/${encodeURIComponent(mediaId)}`,
    {method:'GET',cache:'no-store',redirect:'error',headers:{authorization:`Bearer ${token}`,accept:'application/json'}},
    META_TIMEOUT_MS,fetchImpl,
  );
  const metadata=await metadataResponse.json().catch(()=>({}));
  if(!metadataResponse.ok){
    throw errorWithCode(`META_WHATSAPP_MEDIA_METADATA_HTTP_${metadataResponse.status}`,{providerStatus:metadataResponse.status,retryable:metadataResponse.status===429||metadataResponse.status>=500});
  }
  const mediaUrl=trustedMediaUrl(metadata?.url);
  if(!mediaUrl)throw errorWithCode(metadata?.url?'META_WHATSAPP_MEDIA_URL_UNTRUSTED':'META_WHATSAPP_MEDIA_METADATA_INVALID');
  const metadataMime=normalizeMime(metadata?.mime_type)||normalizeMime(claim.claimed_mime_type);
  if(!metadataMime)throw errorWithCode('VOICE_AUDIO_MIME_INVALID');
  const metadataSize=Number(metadata?.file_size);
  if(Number.isFinite(metadataSize)&&metadataSize>MAX_AUDIO_BYTES)throw errorWithCode('VOICE_AUDIO_TOO_LARGE');

  const mediaResponse=await fetchBounded(mediaUrl,{method:'GET',cache:'no-store',redirect:'error',headers:{authorization:`Bearer ${token}`,accept:'audio/*,*/*'}},META_TIMEOUT_MS,fetchImpl);
  if(!mediaResponse.ok){
    throw errorWithCode(`META_WHATSAPP_MEDIA_DOWNLOAD_HTTP_${mediaResponse.status}`,{providerStatus:mediaResponse.status,retryable:mediaResponse.status===429||mediaResponse.status>=500});
  }
  const declared=Number(mediaResponse.headers?.get?.('content-length'));
  if(Number.isFinite(declared)&&declared>MAX_AUDIO_BYTES)throw errorWithCode('VOICE_AUDIO_TOO_LARGE');
  const bytes=Buffer.from(await mediaResponse.arrayBuffer());
  if(!bytes.length)throw errorWithCode('VOICE_AUDIO_EMPTY',{retryable:true});
  if(bytes.length>MAX_AUDIO_BYTES)throw errorWithCode('VOICE_AUDIO_TOO_LARGE');
  const responseMime=normalizeMime(mediaResponse.headers?.get?.('content-type'))||metadataMime;
  if(!responseMime)throw errorWithCode('VOICE_AUDIO_MIME_INVALID');
  return {bytes,mimeType:responseMime,connection};
}

async function transcribeWithGemini(audioBuffer,mimeType,{env=process.env,fetchImpl=fetch,languageHint='auto'}={}){
  const key=clean(env.GEMINI_API_KEY,8192);
  if(!key)return null;
  const expected=languageHint==='ar'?'Arabic (Gulf/UAE dialect likely)':languageHint==='en'?'English':'Arabic or English';
  const model=clean(env.DABBIR_VOICE_GEMINI_MODEL||env.DABBIR_GEMINI_MODEL||'gemini-3.7-flash',160);
  const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.replace(/^models\//,''))}:generateContent`;
  const prompt=[
    `Transcribe this WhatsApp voice note faithfully. Expected primary language: ${expected}. Preserve Gulf Arabic dialect, names, numbers, dates, times, prices, locations, and any English words exactly as spoken.`,
    'Never infer missing words. If audio is noisy, clipped, ambiguous, or any operational detail such as service, date, time, price, location, person name, or number is uncertain, set needs_confirmation=true.',
    'Return ONLY one minified JSON object with schema:',
    '{"transcript":"","language":"ar|en|auto","confidence":0.0,"needs_confirmation":false,"uncertain_terms":[]}',
    'confidence is transcription reliability from 0 to 1. Do not add facts that are not audible.',
  ].join('\n');
  const response=await fetchBounded(endpoint,{
    method:'POST',cache:'no-store',redirect:'error',
    headers:{'x-goog-api-key':key,'content-type':'application/json',accept:'application/json'},
    body:JSON.stringify({
      contents:[{role:'user',parts:[{text:prompt},{inlineData:{mimeType,data:audioBuffer.toString('base64')}}]}],
      generationConfig:{temperature:0,maxOutputTokens:768,responseMimeType:'application/json'},
    }),
  },GEMINI_TIMEOUT_MS,fetchImpl);
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw errorWithCode(`VOICE_GEMINI_HTTP_${response.status}`,{providerStatus:response.status,retryable:response.status===408||response.status===429||response.status>=500});
  const raw=(payload?.candidates?.[0]?.content?.parts||[]).map(part=>part?.text||'').join('');
  const parsed=parseJsonObject(raw);
  if(!parsed)return null;
  const transcript=clean(parsed.transcript,4000);
  if(!transcript)return null;
  const confidence=Number(parsed.confidence);
  const detected=languageFromText(transcript,parsed.language||languageHint);
  const mismatch=(languageHint==='ar'&&detected==='en')||(languageHint==='en'&&detected==='ar');
  return {
    transcript,
    language:detected,
    confidence:mismatch?Math.min(0.6,Number.isFinite(confidence)?confidence:0.6):(Number.isFinite(confidence)?Math.max(0,Math.min(1,confidence)):0.78),
    needsConfirmation:parsed.needs_confirmation===true||mismatch,
    uncertainTerms:Array.isArray(parsed.uncertain_terms)?parsed.uncertain_terms.map(v=>clean(v,80)).filter(Boolean).slice(0,8):[],
    provider:'google-gemini',model,
  };
}

async function transcribeWithCloudflare(audioBuffer,{env=process.env,fetchImpl=fetch,languageHint='auto'}={}){
  const token=clean(env.CLOUDFLARE_API_TOKEN,8192),account=clean(env.CLOUDFLARE_ACCOUNT_ID,200);
  if(!token||!account)return null;
  const hint=languageHint==='ar'||languageHint==='en'?languageHint:'auto';
  const endpoint=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/${CLOUDFLARE_STT_MODEL}`;
  const request={
    audio:audioBuffer.toString('base64'),task:'transcribe',vad_filter:true,condition_on_previous_text:false,
    initial_prompt:hint==='ar'?'ملاحظة صوتية واتساب لنشاط إماراتي. فرّغ العربية الخليجية كما قيلت حرفيًا، مع الأسماء والأرقام والأوقات والمواقع.':'Business WhatsApp voice note. Transcribe exactly; preserve names, numbers, times and locations.',
    no_speech_threshold:0.6,log_prob_threshold:-1,compression_ratio_threshold:2.4,hallucination_silence_threshold:1,
  };
  if(hint!=='auto')request.language=hint;
  const response=await fetchBounded(endpoint,{
    method:'POST',cache:'no-store',redirect:'error',
    headers:{authorization:`Bearer ${token}`,'content-type':'application/json',accept:'application/json'},
    body:JSON.stringify(request),
  },CLOUDFLARE_TIMEOUT_MS,fetchImpl);
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||payload?.success===false){
    throw errorWithCode(`VOICE_CLOUDFLARE_HTTP_${response.status}`,{providerStatus:response.status,retryable:response.status===408||response.status===429||response.status>=500});
  }
  const transcript=clean(payload?.result?.text||payload?.result?.transcription_info?.text||payload?.text,4000);
  if(!transcript)return null;
  const detected=languageFromText(transcript,hint);
  const mismatch=(hint==='ar'&&detected==='en')||(hint==='en'&&detected==='ar');
  return {transcript,language:detected,confidence:mismatch?0.55:0.84,needsConfirmation:mismatch,uncertainTerms:[],provider:'cloudflare-workers-ai',model:CLOUDFLARE_STT_MODEL};
}

export async function transcribeWhatsAppVoiceAudio(audioBuffer,mimeType,{env=process.env,fetchImpl=fetch,languageHint='auto'}={}){
  if(!Buffer.isBuffer(audioBuffer)||!audioBuffer.length)throw errorWithCode('VOICE_AUDIO_EMPTY');
  if(audioBuffer.length>MAX_AUDIO_BYTES)throw errorWithCode('VOICE_AUDIO_TOO_LARGE');
  const mime=normalizeMime(mimeType);
  if(!mime)throw errorWithCode('VOICE_AUDIO_MIME_INVALID');
  const hint=languageHint==='ar'||languageHint==='en'?languageHint:'auto';
  let geminiError=null;
  if(env.GEMINI_API_KEY){
    try{
      const result=await transcribeWithGemini(audioBuffer,mime,{env,fetchImpl,languageHint:hint});
      if(result)return result;
      geminiError=errorWithCode('VOICE_GEMINI_TRANSCRIPT_INVALID',{retryable:true});
    }catch(error){geminiError=error;}
  }
  if(env.CLOUDFLARE_API_TOKEN&&env.CLOUDFLARE_ACCOUNT_ID){
    try{
      const result=await transcribeWithCloudflare(audioBuffer,{env,fetchImpl,languageHint:hint});
      if(result)return result;
    }catch(error){if(!geminiError)geminiError=error;}
  }
  if(geminiError)throw geminiError;
  throw errorWithCode('VOICE_TRANSCRIPTION_NOT_CONFIGURED');
}

async function recordVoiceUsage(claim,result,byteLength){
  if(!claim?.business_id||!result?.provider)return;
  await serviceRpc('dabbir_record_ai_usage_v1',{
    p_business_id:claim.business_id,
    p_operation_key:`wa-voice:${claim.voice_ingest_id}`,
    p_operation_type:'whatsapp.voice_transcription',
    p_channel:'whatsapp',p_provider:result.provider,p_model:result.model,
    p_cost_mode:result.provider==='cloudflare-workers-ai'?'FREE_FIRST_DIRECT':'FREE_TIER_ONLY',
    p_input_tokens:0,p_output_tokens:0,p_reasoning_tokens:0,p_request_count:1,
    p_actual_cost_microusd:null,p_cost_source:'DIRECT_PROVIDER_COST_UNPRICED',
    p_metadata:{feature:'voice_note_transcription',audio_bytes:Number(byteLength)||0,raw_audio_persisted:false,confidence:result.confidence,needs_confirmation:result.needsConfirmation===true},
  }).catch(()=>null);
}

function clarificationText(language){
  if(language==='ar')return 'ما قدرت أتأكد من التسجيل الصوتي. أعد إرساله بشكل أوضح أو اكتب طلبك.';
  if(language==='en')return 'I could not verify the voice note clearly. Please resend it more clearly or type your request.';
  return 'ما قدرت أتأكد من التسجيل الصوتي. أعد إرساله أو اكتب طلبك. / Please resend the voice note or type your request.';
}

async function reserveClarification(claim,body){
  const row=one(await serviceRpc('dabbir_whatsapp_ai_reserve_outbound',{
    p_business_id:claim.business_id,p_conversation_id:claim.conversation_id,
    p_idempotency_key:`wa-voice-clarify:${claim.voice_ingest_id}`,
    p_payload_hash:hash(body),p_body:body,
  }));
  if(!row?.reservation_id)throw errorWithCode('VOICE_CLARIFICATION_RESERVATION_UNVERIFIED',{retryable:true});
  return row;
}

async function sendClarification(claim,language){
  const body=clarificationText(language),reservation=await reserveClarification(claim,body);
  const state=clean(reservation.reservation_state,40).toUpperCase();
  if(reservation.should_send!==true){
    if(TERMINAL_RESERVATION_STATES.has(state))return {deduplicated:true,state};
    if(state==='AMBIGUOUS')throw errorWithCode('VOICE_CLARIFICATION_OUTBOUND_AMBIGUOUS',{ambiguous:true});
    throw errorWithCode(`VOICE_CLARIFICATION_RESERVATION_${state||'UNSENDABLE'}`,{retryable:state!=='FAILED'});
  }
  const key=serviceKey();
  if(!key)throw errorWithCode('WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED',{retryable:true});
  const connection=await loadConversationConnectionWithServiceKey(key,claim.business_id,claim.conversation_id);
  try{
    const sent=await sendMetaText({connection,businessId:claim.business_id,recipient:reservation.recipient_handle,body});
    try{return await finalizeOutboundReply({reservationId:reservation.reservation_id,providerMessageId:sent.providerMessageId});}
    catch(error){await markOutboundResult(reservation.reservation_id,'AMBIGUOUS','VOICE_CLARIFICATION_FINALIZE_UNCERTAIN');error.ambiguous=true;throw error;}
  }catch(error){
    await markOutboundResult(reservation.reservation_id,error?.ambiguous?'AMBIGUOUS':'FAILED',clean(error?.code||error?.message,160));
    throw error;
  }
}

async function completeClarification(claim,language){
  await sendClarification(claim,language);
  return serviceRpc('dabbir_whatsapp_voice_complete_clarification',{p_voice_ingest_id:claim.voice_ingest_id,p_lock_token:claim.lock_token});
}

function fallbackLanguage(claim){return languageFromText('',claim?.business_locale||'auto')}
function retryable(error){
  if(error?.ambiguous===true)return false;
  if(error?.retryable===true)return true;
  const status=Number(error?.providerStatus||error?.status||0);
  return status===408||status===429||status>=500||error instanceof TypeError;
}

async function processClaim(claim,{env=process.env,fetchImpl=fetch}={}){
  if(claim?.clarification_pending===true)return {state:'CLARIFICATION_REQUIRED',...(await completeClarification(claim,fallbackLanguage(claim)))};
  const media=await loadMetaAudio(claim,{env,fetchImpl});
  const tenantLanguage=fallbackLanguage(claim);
  const transcription=await transcribeWhatsAppVoiceAudio(media.bytes,media.mimeType,{env,fetchImpl,languageHint:tenantLanguage});
  const finalized=await serviceRpc('dabbir_whatsapp_voice_finalize',{
    p_voice_ingest_id:claim.voice_ingest_id,p_lock_token:claim.lock_token,
    p_transcript:transcription.transcript,p_language:transcription.language,p_confidence:transcription.confidence,
    p_needs_confirmation:transcription.needsConfirmation===true,p_provider:transcription.provider,p_model:transcription.model,
    p_media_mime_type:media.mimeType,p_byte_length:media.bytes.length,
  });
  await recordVoiceUsage(claim,transcription,media.bytes.length);
  if(finalized?.state==='CLARIFICATION_PENDING'){
    await completeClarification(claim,tenantLanguage);
    return {state:'CLARIFICATION_REQUIRED',provider:transcription.provider,model:transcription.model,confidence:transcription.confidence};
  }
  return {state:'PROCESSED',provider:transcription.provider,model:transcription.model,confidence:transcription.confidence,message_id:finalized?.message_id||null};
}

async function handleClaimFailure(claim,error){
  const code=clean(error?.code||error?.message||'VOICE_PROCESSING_FAILED',240);
  if(error?.ambiguous===true){
    await serviceRpc('dabbir_whatsapp_ai_handoff',{
      p_business_id:claim.business_id,p_conversation_id:claim.conversation_id,p_route_class:'SUPPORT',
      p_reason:'Ambiguous voice-note clarification delivery requires human review',p_summary:code,
    }).catch(()=>null);
    await serviceRpc('dabbir_whatsapp_voice_fail',{p_voice_ingest_id:claim.voice_ingest_id,p_lock_token:claim.lock_token,p_error:code,p_retry:false}).catch(()=>null);
    return {state:'DEAD',error:code,handoff:true};
  }
  const finalAttempt=Number(claim?.attempt_count||0)>=Number(claim?.max_attempts||3);
  const permanent=PERMANENT_VOICE_ERRORS.has(code)||!retryable(error);
  if(finalAttempt||permanent){
    try{
      const language=fallbackLanguage(claim);
      const finalized=await serviceRpc('dabbir_whatsapp_voice_finalize',{
        p_voice_ingest_id:claim.voice_ingest_id,p_lock_token:claim.lock_token,p_transcript:null,p_language:language,p_confidence:0,
        p_needs_confirmation:true,p_provider:'unavailable',p_model:null,p_media_mime_type:clean(claim?.claimed_mime_type,160)||null,p_byte_length:null,
      });
      if(finalized?.state==='CLARIFICATION_PENDING'){
        await completeClarification(claim,language);
        return {state:'CLARIFICATION_REQUIRED',error:code};
      }
    }catch(finalError){
      const finalCode=clean(finalError?.code||finalError?.message||code,240);
      await serviceRpc('dabbir_whatsapp_voice_fail',{p_voice_ingest_id:claim.voice_ingest_id,p_lock_token:claim.lock_token,p_error:finalCode,p_retry:false}).catch(()=>null);
      return {state:'DEAD',error:finalCode};
    }
  }
  const failed=await serviceRpc('dabbir_whatsapp_voice_fail',{p_voice_ingest_id:claim.voice_ingest_id,p_lock_token:claim.lock_token,p_error:code,p_retry:true}).catch(()=>null);
  return {state:failed?.state||'RETRY',error:code};
}

export async function processWhatsAppVoiceDispatchToken(dispatchToken,options={}){
  const token=clean(dispatchToken,80);
  if(!UUID.test(token))return {claimed:false,state:'STALE_TOKEN'};
  let claim=await serviceRpc('dabbir_whatsapp_voice_claim_dispatch',{p_dispatch_token:token});
  if(claim?.state==='WAIT'){
    const delay=Math.min(1500,Math.max(0,new Date(claim.ready_at).getTime()-Date.now()+30));
    if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));
    claim=await serviceRpc('dabbir_whatsapp_voice_claim_dispatch',{p_dispatch_token:token});
  }
  if(claim?.state!=='CLAIMED')return {claimed:false,state:clean(claim?.state,40)||'NOOP'};
  try{return {claimed:true,...await processClaim(claim,options)};}catch(error){return {claimed:true,...await handleClaimFailure(claim,error)};}
}

export async function processWhatsAppVoiceRecovery({limit=6,...options}={}){
  const results=[];
  for(let i=0;i<Math.max(1,Math.min(12,Number(limit)||6));i+=1){
    const claim=await serviceRpc('dabbir_whatsapp_voice_claim_next',{});
    if(claim?.state==='EMPTY')break;
    if(claim?.state!=='CLAIMED'){results.push({state:claim?.state||'NOOP'});continue;}
    try{results.push(await processClaim(claim,options));}catch(error){results.push(await handleClaimFailure(claim,error));}
  }
  return {processed:results.length,results};
}
