-- DABBIR WhatsApp voice notes AI v1.
-- Signed Meta audio events are persisted durably before any provider read.
-- Raw audio bytes are never written to Postgres. A successful high-confidence transcript
-- becomes a normal customer message and enters the existing WhatsApp AI queue.
-- Uncertain transcription is fail-closed: no business action is enqueued; the worker sends
-- one idempotent clarification request through the existing outbound reservation path.

create table if not exists public.dabbir_whatsapp_voice_ingest (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  connection_id uuid not null references public.dabbir_whatsapp_connections(id) on delete cascade,
  conversation_id uuid not null,
  customer_id uuid not null references public.dabbir_customers(id) on delete cascade,
  provider_message_id text not null,
  media_id text not null,
  claimed_mime_type text,
  is_voice_note boolean not null default true,
  signature_verified boolean not null default true,
  state text not null default 'RECEIVED',
  dispatch_token uuid not null default gen_random_uuid(),
  attempt_count smallint not null default 0,
  max_attempts smallint not null default 3,
  lock_token uuid,
  locked_until timestamptz,
  next_attempt_at timestamptz,
  transcription_provider text,
  transcription_model text,
  transcription_language text,
  transcription_confidence numeric(5,4),
  media_mime_type text,
  byte_length bigint,
  message_id uuid references public.dabbir_messages(id) on delete set null,
  clarification_required boolean not null default false,
  error_code text,
  occurred_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dabbir_whatsapp_voice_business_conversation_fk
    foreign key (business_id,conversation_id) references public.dabbir_conversations(business_id,id) on delete cascade,
  constraint dabbir_whatsapp_voice_provider_message_len check (char_length(provider_message_id) between 3 and 320),
  constraint dabbir_whatsapp_voice_media_id_len check (char_length(media_id) between 3 and 320),
  constraint dabbir_whatsapp_voice_mime_len check (claimed_mime_type is null or char_length(claimed_mime_type) between 3 and 160),
  constraint dabbir_whatsapp_voice_state_check check (state in ('RECEIVED','PROCESSING','RETRY','PROCESSED','CLARIFICATION_REQUIRED','DEAD')),
  constraint dabbir_whatsapp_voice_attempt_check check (attempt_count between 0 and 10),
  constraint dabbir_whatsapp_voice_max_attempts_check check (max_attempts between 1 and 5),
  constraint dabbir_whatsapp_voice_confidence_check check (transcription_confidence is null or transcription_confidence between 0 and 1),
  constraint dabbir_whatsapp_voice_bytes_check check (byte_length is null or byte_length between 0 and 20971520),
  constraint dabbir_whatsapp_voice_business_provider_uq unique (business_id,provider_message_id),
  constraint dabbir_whatsapp_voice_dispatch_token_uq unique (dispatch_token)
);

create index if not exists dabbir_whatsapp_voice_due_idx
  on public.dabbir_whatsapp_voice_ingest(state,next_attempt_at,created_at)
  where state in ('RECEIVED','RETRY','PROCESSING');
create index if not exists dabbir_whatsapp_voice_conversation_idx
  on public.dabbir_whatsapp_voice_ingest(business_id,conversation_id,created_at desc);

alter table public.dabbir_whatsapp_voice_ingest enable row level security;
revoke all on table public.dabbir_whatsapp_voice_ingest from public,anon,authenticated;
grant select,insert,update,delete on table public.dabbir_whatsapp_voice_ingest to service_role;

create or replace function public.dabbir_whatsapp_persist_voice_inbound(
  p_phone_number_id text,
  p_provider_message_id text,
  p_sender_handle text,
  p_display_name text,
  p_media_id text,
  p_claimed_mime_type text,
  p_is_voice_note boolean default true,
  p_occurred_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth','extensions','net'
as $$
declare
  v_connection public.dabbir_whatsapp_connections%rowtype;
  v_customer_id uuid;
  v_conversation_id uuid;
  v_existing public.dabbir_whatsapp_voice_ingest%rowtype;
  v_ingest public.dabbir_whatsapp_voice_ingest%rowtype;
  v_sender text:=trim(coalesce(p_sender_handle,''));
  v_name text;
  v_dispatch_request bigint;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if nullif(trim(p_phone_number_id),'') is null then raise exception 'WHATSAPP_PHONE_NUMBER_ID_REQUIRED'; end if;
  if nullif(trim(p_provider_message_id),'') is null or char_length(trim(p_provider_message_id))>320 then raise exception 'WHATSAPP_PROVIDER_MESSAGE_ID_REQUIRED'; end if;
  if nullif(v_sender,'') is null or char_length(v_sender)>160 then raise exception 'WHATSAPP_SENDER_REQUIRED'; end if;
  if nullif(trim(p_media_id),'') is null or char_length(trim(p_media_id))>320 then raise exception 'WHATSAPP_MEDIA_ID_REQUIRED'; end if;
  if p_claimed_mime_type is not null and char_length(trim(p_claimed_mime_type))>160 then raise exception 'WHATSAPP_MEDIA_MIME_INVALID'; end if;

  select * into v_connection
  from public.dabbir_whatsapp_connections c
  where c.phone_number_id=trim(p_phone_number_id) and c.status='connected'
  limit 1;
  if not found or v_connection.branch_id is null then raise exception 'WHATSAPP_TENANT_CONNECTION_NOT_FOUND'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_connection.business_id::text||':voice:'||trim(p_provider_message_id),0));
  select * into v_existing
  from public.dabbir_whatsapp_voice_ingest v
  where v.business_id=v_connection.business_id and v.provider_message_id=trim(p_provider_message_id)
  limit 1;
  if found then
    return jsonb_build_object(
      'persisted',true,'duplicate',true,'voice_ingest_id',v_existing.id,
      'business_id',v_existing.business_id,'connection_id',v_existing.connection_id,
      'conversation_id',v_existing.conversation_id,'customer_id',v_existing.customer_id,
      'dispatch_token',v_existing.dispatch_token,'state',v_existing.state
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_connection.business_id::text||':'||v_connection.branch_id::text||':wa-sender:'||v_sender,0));
  v_name:=left(coalesce(nullif(trim(p_display_name),''),'WhatsApp Customer'),120);
  insert into public.dabbir_customers(business_id,display_name,channel_handle,lead_status,metadata)
  values(v_connection.business_id,v_name,v_sender,'new',jsonb_build_object('source','whatsapp','provider','meta'))
  on conflict (business_id,channel_handle) where channel_handle is not null
  do update set
    display_name=case when excluded.display_name<>'WhatsApp Customer' then excluded.display_name else public.dabbir_customers.display_name end,
    metadata=coalesce(public.dabbir_customers.metadata,'{}'::jsonb)||jsonb_build_object('source','whatsapp','provider','meta')
  returning id into v_customer_id;

  select c.id into v_conversation_id
  from public.dabbir_conversations c
  where c.business_id=v_connection.business_id and c.branch_id=v_connection.branch_id
    and c.customer_id=v_customer_id and c.channel_type='whatsapp' and c.demo_mode=false and c.state<>'closed'
  order by c.updated_at desc limit 1 for update;

  if v_conversation_id is null then
    insert into public.dabbir_conversations(business_id,branch_id,customer_id,channel_type,state,demo_mode)
    values(v_connection.business_id,v_connection.branch_id,v_customer_id,'whatsapp','ai_active',false)
    returning id into v_conversation_id;
  else
    update public.dabbir_conversations
       set state=case when state='waiting_customer' then 'ai_active' else state end,updated_at=now()
     where id=v_conversation_id and business_id=v_connection.business_id and branch_id=v_connection.branch_id;
  end if;

  insert into public.dabbir_whatsapp_voice_ingest(
    business_id,connection_id,conversation_id,customer_id,provider_message_id,media_id,
    claimed_mime_type,is_voice_note,signature_verified,state,occurred_at
  ) values (
    v_connection.business_id,v_connection.id,v_conversation_id,v_customer_id,trim(p_provider_message_id),trim(p_media_id),
    nullif(left(trim(coalesce(p_claimed_mime_type,'')),160),''),coalesce(p_is_voice_note,true),true,'RECEIVED',coalesce(p_occurred_at,now())
  ) returning * into v_ingest;

  begin
    v_dispatch_request:=net.http_post(
      url:='https://dabbir.bmalman.com/api/dabbir-whatsapp-voice-worker',
      body:=jsonb_build_object('dispatch_token',v_ingest.dispatch_token::text),
      params:='{}'::jsonb,
      headers:=jsonb_build_object('Content-Type','application/json','User-Agent','dabbir-pg-net/1.0'),
      timeout_milliseconds:=1000
    );
  exception when others then
    update public.dabbir_whatsapp_voice_ingest
      set error_code='VOICE_FAST_DISPATCH_ENQUEUE_FAILED',updated_at=now()
      where id=v_ingest.id;
  end;

  update public.dabbir_whatsapp_connections
     set last_verified_at=now(),last_provider_status=200,last_error=null,updated_at=now()
   where id=v_connection.id;

  return jsonb_build_object(
    'persisted',true,'duplicate',false,'voice_ingest_id',v_ingest.id,
    'business_id',v_connection.business_id,'connection_id',v_connection.id,
    'conversation_id',v_conversation_id,'customer_id',v_customer_id,
    'dispatch_token',v_ingest.dispatch_token,'state','RECEIVED'
  );
end;
$$;
revoke all on function public.dabbir_whatsapp_persist_voice_inbound(text,text,text,text,text,text,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_persist_voice_inbound(text,text,text,text,text,text,boolean,timestamptz) to service_role;

create or replace function public.dabbir_whatsapp_voice_claim_dispatch(p_dispatch_token uuid)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth','extensions'
as $$
declare
  v public.dabbir_whatsapp_voice_ingest%rowtype;
  v_lock uuid;
  v_locale text;
  v_due timestamptz;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_dispatch_token is null then return jsonb_build_object('state','STALE_TOKEN'); end if;
  select * into v from public.dabbir_whatsapp_voice_ingest where dispatch_token=p_dispatch_token limit 1 for update;
  if not found then return jsonb_build_object('state','STALE_TOKEN'); end if;
  if v.state in ('PROCESSED','CLARIFICATION_REQUIRED','DEAD') then return jsonb_build_object('state',v.state,'voice_ingest_id',v.id); end if;
  if v.state='PROCESSING' and coalesce(v.locked_until,now()+interval '1 minute')>now() then return jsonb_build_object('state','BUSY','voice_ingest_id',v.id); end if;
  if v.state='PROCESSING' then
    update public.dabbir_whatsapp_voice_ingest set state='RETRY',lock_token=null,locked_until=null,next_attempt_at=now(),error_code='VOICE_STALE_PROCESSING_LOCK_RECOVERED',updated_at=now() where id=v.id;
    select * into v from public.dabbir_whatsapp_voice_ingest where id=v.id;
  end if;
  v_due:=coalesce(v.next_attempt_at,v.created_at);
  if v_due>now() then return jsonb_build_object('state','WAIT','voice_ingest_id',v.id,'ready_at',v_due); end if;
  if v.state not in ('RECEIVED','RETRY') then return jsonb_build_object('state','BUSY','voice_ingest_id',v.id); end if;
  v_lock:=gen_random_uuid();
  update public.dabbir_whatsapp_voice_ingest
     set state='PROCESSING',attempt_count=attempt_count+1,lock_token=v_lock,locked_until=now()+interval '90 seconds',next_attempt_at=null,error_code=null,updated_at=now()
   where id=v.id returning * into v;
  select b.locale into v_locale from public.dabbir_businesses b where b.id=v.business_id;
  return jsonb_build_object(
    'state','CLAIMED','voice_ingest_id',v.id,'lock_token',v_lock,'attempt_count',v.attempt_count,'max_attempts',v.max_attempts,
    'business_id',v.business_id,'connection_id',v.connection_id,'conversation_id',v.conversation_id,'customer_id',v.customer_id,
    'provider_message_id',v.provider_message_id,'media_id',v.media_id,'claimed_mime_type',v.claimed_mime_type,
    'is_voice_note',v.is_voice_note,'clarification_pending',(v.message_id is not null and v.clarification_required),
    'message_id',v.message_id,'business_locale',v_locale
  );
end;
$$;
revoke all on function public.dabbir_whatsapp_voice_claim_dispatch(uuid) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_voice_claim_dispatch(uuid) to service_role;

create or replace function public.dabbir_whatsapp_voice_claim_next()
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare v_token uuid;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select dispatch_token into v_token
  from public.dabbir_whatsapp_voice_ingest
  where (
    state in ('RECEIVED','RETRY') and coalesce(next_attempt_at,created_at)<=now()
  ) or (
    state='PROCESSING' and locked_until<now()
  )
  order by created_at asc limit 1 for update skip locked;
  if v_token is null then return jsonb_build_object('state','EMPTY'); end if;
  return public.dabbir_whatsapp_voice_claim_dispatch(v_token);
end;
$$;
revoke all on function public.dabbir_whatsapp_voice_claim_next() from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_voice_claim_next() to service_role;

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
set search_path='pg_catalog','public','auth','extensions','net'
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
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into v from public.dabbir_whatsapp_voice_ingest where id=p_voice_ingest_id for update;
  if not found then raise exception 'VOICE_INGEST_NOT_FOUND'; end if;
  if v.state<>'PROCESSING' or v.lock_token is distinct from p_lock_token then raise exception 'VOICE_INGEST_LOCK_MISMATCH'; end if;
  if p_byte_length is not null and (p_byte_length<0 or p_byte_length>20971520) then raise exception 'VOICE_AUDIO_SIZE_INVALID'; end if;

  v_uncertain:=coalesce(p_needs_confirmation,false) or nullif(trim(coalesce(p_transcript,'')),'') is null or v_confidence<0.82;
  select branch_id into v_branch_id from public.dabbir_conversations where business_id=v.business_id and id=v.conversation_id;
  if v_branch_id is null then raise exception 'VOICE_CONVERSATION_BRANCH_UNVERIFIED'; end if;

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
    v_body:=left(trim(p_transcript),4000);
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
      'needs_confirmation',v_uncertain,'raw_audio_persisted',false
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

create or replace function public.dabbir_whatsapp_voice_complete_clarification(p_voice_ingest_id uuid,p_lock_token uuid)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare v public.dabbir_whatsapp_voice_ingest%rowtype;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into v from public.dabbir_whatsapp_voice_ingest where id=p_voice_ingest_id for update;
  if not found then raise exception 'VOICE_INGEST_NOT_FOUND'; end if;
  if v.state<>'PROCESSING' or v.lock_token is distinct from p_lock_token or v.clarification_required is not true or v.message_id is null then raise exception 'VOICE_CLARIFICATION_STATE_INVALID'; end if;
  update public.dabbir_whatsapp_voice_ingest
     set state='CLARIFICATION_REQUIRED',lock_token=null,locked_until=null,next_attempt_at=null,error_code=null,processed_at=now(),updated_at=now()
   where id=v.id;
  return jsonb_build_object('state','CLARIFICATION_REQUIRED','voice_ingest_id',v.id,'message_id',v.message_id);
end;
$$;
revoke all on function public.dabbir_whatsapp_voice_complete_clarification(uuid,uuid) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_voice_complete_clarification(uuid,uuid) to service_role;

create or replace function public.dabbir_whatsapp_voice_fail(p_voice_ingest_id uuid,p_lock_token uuid,p_error text,p_retry boolean default true)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare v public.dabbir_whatsapp_voice_ingest%rowtype;v_delay integer;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into v from public.dabbir_whatsapp_voice_ingest where id=p_voice_ingest_id for update;
  if not found then raise exception 'VOICE_INGEST_NOT_FOUND'; end if;
  if v.state<>'PROCESSING' or v.lock_token is distinct from p_lock_token then raise exception 'VOICE_INGEST_LOCK_MISMATCH'; end if;
  if coalesce(p_retry,true) and v.attempt_count<v.max_attempts then
    v_delay:=least(60,greatest(2,(2^least(v.attempt_count,5))::integer));
    update public.dabbir_whatsapp_voice_ingest
       set state='RETRY',next_attempt_at=now()+make_interval(secs=>v_delay),lock_token=null,locked_until=null,error_code=left(coalesce(p_error,'VOICE_RETRY'),240),updated_at=now()
     where id=v.id;
  else
    update public.dabbir_whatsapp_voice_ingest
       set state='DEAD',next_attempt_at=null,lock_token=null,locked_until=null,error_code=left(coalesce(p_error,'VOICE_FAILED'),240),processed_at=now(),updated_at=now()
     where id=v.id;
  end if;
  select * into v from public.dabbir_whatsapp_voice_ingest where id=v.id;
  return jsonb_build_object('state',v.state,'voice_ingest_id',v.id,'attempt_count',v.attempt_count,'next_attempt_at',v.next_attempt_at);
end;
$$;
revoke all on function public.dabbir_whatsapp_voice_fail(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_voice_fail(uuid,uuid,text,boolean) to service_role;

comment on table public.dabbir_whatsapp_voice_ingest is
  'Durable signed WhatsApp audio ingestion state. Stores provider media identifiers and transcription metadata only; raw audio bytes are never persisted.';
