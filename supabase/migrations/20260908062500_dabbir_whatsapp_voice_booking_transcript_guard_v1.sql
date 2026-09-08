create or replace function public.dabbir_whatsapp_voice_finalize(
  p_voice_ingest_id uuid,
  p_lock_token uuid,
  p_transcript text,
  p_language text,
  p_confidence numeric,
  p_needs_confirmation boolean,
  p_provider text,
  p_model text,
  p_media_mime_type text,
  p_byte_length bigint
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','auth','extensions','net'
as $$
declare
  v public.dabbir_whatsapp_voice_ingest%rowtype;
  v_existing public.dabbir_whatsapp_event_ledger%rowtype;
  v_message_id uuid;
  v_batch_id uuid;
  v_dispatch_token uuid;
  v_dispatch_request bigint;
  v_confidence numeric:=greatest(0,least(1,coalesce(p_confidence,0)));
  v_language text:=case when lower(trim(coalesce(p_language,''))) like 'ar%' then 'ar' when lower(trim(coalesce(p_language,''))) like 'en%' then 'en' else 'auto' end;
  v_uncertain boolean;
  v_body text;
  v_intent text;
  v_branch_id uuid;
  v_pending_action text;
  v_business_locale text;
  v_transcript text:=left(trim(coalesce(p_transcript,'')),4000);
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into v from public.dabbir_whatsapp_voice_ingest where id=p_voice_ingest_id for update;
  if not found then raise exception 'VOICE_INGEST_NOT_FOUND'; end if;
  if v.state<>'PROCESSING' or v.lock_token is distinct from p_lock_token then raise exception 'VOICE_INGEST_LOCK_MISMATCH'; end if;
  if p_byte_length is not null and (p_byte_length<0 or p_byte_length>20971520) then raise exception 'VOICE_AUDIO_SIZE_INVALID'; end if;

  v_uncertain:=coalesce(p_needs_confirmation,false) or nullif(v_transcript,'') is null or v_confidence<0.82;
  select c.branch_id into v_branch_id from public.dabbir_conversations c where c.business_id=v.business_id and c.id=v.conversation_id;
  if v_branch_id is null then raise exception 'VOICE_CONVERSATION_BRANCH_UNVERIFIED'; end if;
  select b.locale into v_business_locale from public.dabbir_businesses b where b.id=v.business_id;
  select s.pending_action into v_pending_action
    from public.dabbir_ai_conversation_state s
   where s.business_id=v.business_id and s.conversation_id=v.conversation_id
     and (s.expires_at is null or s.expires_at>now())
   limit 1;

  if not v_uncertain
     and lower(trim(coalesce(p_provider,'')))='cloudflare-workers-ai'
     and lower(coalesce(v_business_locale,'')) like 'ar%'
     and v_language='en'
     and v_transcript !~ '[\u0600-\u06FF]' then
    v_uncertain:=true;
  end if;

  if not v_uncertain and v_pending_action='service_selected' and v_transcript !~* '([0-9٠-٩]|اليوم|باجر|بكره|بكرة|غد|غداً|غدا|السبت|الأحد|الاحد|الاثنين|الثلاثاء|الأربعاء|الاربعاء|الخميس|الجمعة|ساعة|الساعه|الساعة|صباح|مساء|ظهر|عصر|مغرب|عشاء|فجر|today|tomorrow|saturday|sunday|monday|tuesday|wednesday|thursday|friday|\mam\M|\mpm\M|\mat\M)' then
    v_uncertain:=true;
  end if;

  select * into v_existing from public.dabbir_whatsapp_event_ledger e
   where e.business_id=v.business_id and e.event_key='inbound:'||v.provider_message_id limit 1;
  if found and v_existing.message_id is not null then
    update public.dabbir_whatsapp_voice_ingest
       set message_id=v_existing.message_id,
           state=case when v_uncertain then 'PROCESSING' else 'PROCESSED' end,
           clarification_required=v_uncertain,
           transcription_provider=left(nullif(trim(coalesce(p_provider,'')),''),120),
           transcription_model=left(nullif(trim(coalesce(p_model,'')),''),160),
           transcription_language=v_language,
           transcription_confidence=v_confidence,
           media_mime_type=left(nullif(trim(coalesce(p_media_mime_type,'')),''),160),
           byte_length=p_byte_length,
           processed_at=case when v_uncertain then processed_at else coalesce(processed_at,now()) end,
           updated_at=now()
     where id=v.id;
    return jsonb_build_object('state',case when v_uncertain then 'CLARIFICATION_PENDING' else 'PROCESSED' end,'message_id',v_existing.message_id,'conversation_id',v.conversation_id,'duplicate',true);
  end if;

  if v_uncertain then
    v_body:=case when v_language='ar' then '[رسالة صوتية غير واضحة بما يكفي للتنفيذ]'
                 when v_language='en' then '[Voice note was not clear enough to execute safely]'
                 else '[Voice note unclear / الرسالة الصوتية غير واضحة]'
            end;
    v_intent:='VOICE_NOTE_UNCERTAIN';
  else
    v_body:=v_transcript;
    v_intent:='VOICE_NOTE_TRANSCRIPT';
  end if;

  insert into public.dabbir_messages(business_id,conversation_id,sender_type,body,intent,simulated)
  values(v.business_id,v.conversation_id,'customer',v_body,v_intent,false)
  returning id into v_message_id;

  insert into public.dabbir_whatsapp_event_ledger(
    business_id,connection_id,event_key,direction,event_type,provider_message_id,
    conversation_id,message_id,provider_status,provider_verified,occurred_at,verified_at,evidence
  ) values (
    v.business_id,v.connection_id,'inbound:'||v.provider_message_id,'inbound','message',v.provider_message_id,
    v.conversation_id,v_message_id,'received',true,v.occurred_at,now(),
    jsonb_build_object(
      'source','meta_signed_webhook_voice_transcription','signature_verified',true,'voice_note',v.is_voice_note,
      'branch_id',v_branch_id,'media_mime_type',left(coalesce(p_media_mime_type,''),160),
      'transcription_provider',left(coalesce(p_provider,''),120),'transcription_model',left(coalesce(p_model,''),160),
      'transcription_language',v_language,'transcription_confidence',v_confidence,
      'needs_confirmation',v_uncertain,'raw_audio_persisted',false,
      'booking_transcript_guard',v_pending_action='service_selected'
    )
  );

  if not v_uncertain then
    v_batch_id:=public.dabbir_enqueue_message_batch(v.business_id,v.conversation_id,v.customer_id,'whatsapp',v_message_id,1200,false,null);
    v_dispatch_token:=gen_random_uuid();
    update public.dabbir_message_batches set dispatch_token=v_dispatch_token,dispatched_at=null,last_error=null,updated_at=now() where id=v_batch_id;
    begin
      v_dispatch_request:=net.http_post(
        url:='https://dabbir.bmalman.com/api/dabbir-whatsapp-ai-worker',
        body:=jsonb_build_object('dispatch_token',v_dispatch_token::text),params:='{}'::jsonb,
        headers:=jsonb_build_object('Content-Type','application/json','User-Agent','dabbir-pg-net/1.0'),timeout_milliseconds:=1000
      );
      update public.dabbir_message_batches set dispatched_at=now(),updated_at=now() where id=v_batch_id;
    exception when others then
      update public.dabbir_message_batches set last_error='VOICE_AI_FAST_DISPATCH_ENQUEUE_FAILED',updated_at=now() where id=v_batch_id;
    end;
  end if;

  update public.dabbir_whatsapp_voice_ingest
     set message_id=v_message_id,state=case when v_uncertain then 'PROCESSING' else 'PROCESSED' end,
         clarification_required=v_uncertain,
         transcription_provider=left(nullif(trim(coalesce(p_provider,'')),''),120),
         transcription_model=left(nullif(trim(coalesce(p_model,'')),''),160),
         transcription_language=v_language,transcription_confidence=v_confidence,
         media_mime_type=left(nullif(trim(coalesce(p_media_mime_type,'')),''),160),byte_length=p_byte_length,
         processed_at=case when v_uncertain then null else now() end,
         updated_at=now()
   where id=v.id;

  return jsonb_build_object(
    'state',case when v_uncertain then 'CLARIFICATION_PENDING' else 'PROCESSED' end,
    'message_id',v_message_id,'conversation_id',v.conversation_id,'business_id',v.business_id,
    'batch_id',v_batch_id,'ai_dispatch_token',v_dispatch_token,'duplicate',false
  );
end;
$$;

revoke all on function public.dabbir_whatsapp_voice_finalize(uuid,uuid,text,text,numeric,boolean,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_voice_finalize(uuid,uuid,text,text,numeric,boolean,text,text,text,bigint) to service_role;
