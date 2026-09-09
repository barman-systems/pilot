-- DABBIR customer persistence root fix v1
--
-- Root causes addressed:
-- 1) normal WhatsApp text/voice inbound stored the WA sender only in channel_handle,
--    while coexistence stored phone_e164 too;
-- 2) customer resolution used channel_handle only, so a pre-existing customer with the
--    same canonical phone could become a second logical customer;
-- 3) provider-name synchronization could mistake an unchanged local name for a new
--    WhatsApp provider name when metadata alone changed.
--
-- This migration keeps owner-selected names authoritative, normalizes Meta WA IDs to
-- digits, fills phone_e164, resolves by either WA handle or canonical phone, and fails
-- closed on ambiguous identity collisions. No conversation/history rows are rewritten.

create or replace function dabbir_private.guard_customer_whatsapp_display_name()
returns trigger
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $function$
declare
  v_service_whatsapp boolean :=
    coalesce(auth.role(),'')='service_role'
    and coalesce(new.metadata->>'source','')='whatsapp'
    and coalesce(new.metadata->>'provider','')='meta';
  v_incoming text;
  v_legacy_manual boolean := false;
begin
  if not v_service_whatsapp then return new; end if;

  -- The resolver can pass the provider name through metadata for this trigger only.
  -- Remove the transient field before the row is persisted so provider PII is not
  -- duplicated in metadata.
  v_incoming:=left(nullif(trim(new.metadata->>'_dabbir_provider_display_name'),''),120);
  new.metadata:=coalesce(new.metadata,'{}'::jsonb)-'_dabbir_provider_display_name';

  if v_incoming is null then
    if tg_op='INSERT' then
      v_incoming:=left(nullif(trim(new.display_name),''),120);
    elsif new.display_name is distinct from old.display_name then
      v_incoming:=left(nullif(trim(new.display_name),''),120);
    end if;
  end if;
  if v_incoming='WhatsApp Customer' then v_incoming:=null; end if;

  if v_incoming is not null then
    new.whatsapp_display_name:=v_incoming;
  end if;

  if tg_op='INSERT' then
    if new.whatsapp_display_name is not null then
      new.display_name_source:='whatsapp';
      if v_incoming is not null then new.display_name:=v_incoming; end if;
    end if;
    return new;
  end if;

  -- A legacy/manual customer that existed by phone before a WA conversation must not
  -- lose the locally selected canonical name just because WA is attached later.
  v_legacy_manual:=old.display_name_source='system'
    and old.channel_handle is null
    and old.phone_e164 is not null;

  if old.display_name_source='owner' then
    new.display_name:=old.display_name;
    new.display_name_source:='owner';
    new.owner_display_name_updated_at:=old.owner_display_name_updated_at;
  elsif v_legacy_manual then
    new.display_name:=old.display_name;
    new.display_name_source:='system';
  elsif v_incoming is not null then
    new.display_name:=v_incoming;
    new.display_name_source:='whatsapp';
  elsif old.display_name_source='whatsapp' then
    new.display_name_source:='whatsapp';
  end if;
  return new;
end;
$function$;

revoke all on function dabbir_private.guard_customer_whatsapp_display_name() from public,anon,authenticated;

create or replace function dabbir_private.resolve_whatsapp_customer_v1(
  p_business_id uuid,
  p_sender_handle text,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path='pg_catalog','public','dabbir_private','auth'
as $function$
declare
  v_handle text:=regexp_replace(coalesce(p_sender_handle,''),'[^0-9]','','g');
  v_phone text;
  v_name text:=left(coalesce(nullif(trim(p_display_name),''),'WhatsApp Customer'),120);
  v_by_handle uuid;
  v_by_phone uuid;
  v_customer_id uuid;
  v_metadata jsonb:=jsonb_build_object('source','whatsapp','provider','meta');
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_business_id is null then raise exception 'WHATSAPP_BUSINESS_REQUIRED'; end if;
  if length(v_handle) not between 7 and 20 then raise exception 'WHATSAPP_SENDER_REQUIRED'; end if;
  v_phone:='+'||v_handle;

  if v_name<>'WhatsApp Customer' then
    v_metadata:=v_metadata||jsonb_build_object('_dabbir_provider_display_name',v_name);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':wa-customer:'||v_handle,0));

  select c.id into v_by_handle
  from public.dabbir_customers c
  where c.business_id=p_business_id and c.channel_handle=v_handle
  order by c.created_at asc,c.id asc
  limit 1 for update;

  select c.id into v_by_phone
  from public.dabbir_customers c
  where c.business_id=p_business_id and c.phone_e164=v_phone
  order by c.created_at asc,c.id asc
  limit 1 for update;

  if v_by_handle is not null and v_by_phone is not null and v_by_handle<>v_by_phone then
    raise exception 'WHATSAPP_CUSTOMER_IDENTITY_CONFLICT' using errcode='23505';
  end if;

  v_customer_id:=coalesce(v_by_handle,v_by_phone);

  if v_customer_id is null then
    insert into public.dabbir_customers(
      business_id,display_name,channel_handle,phone_e164,lead_status,metadata
    ) values (
      p_business_id,v_name,v_handle,v_phone,'new',v_metadata
    ) returning id into v_customer_id;
  else
    update public.dabbir_customers c
       set channel_handle=coalesce(c.channel_handle,v_handle),
           phone_e164=coalesce(c.phone_e164,v_phone),
           display_name=case when v_name<>'WhatsApp Customer' then v_name else c.display_name end,
           metadata=coalesce(c.metadata,'{}'::jsonb)||v_metadata,
           updated_at=now()
     where c.id=v_customer_id and c.business_id=p_business_id;
  end if;

  return v_customer_id;
end;
$function$;

revoke all on function dabbir_private.resolve_whatsapp_customer_v1(uuid,text,text) from public,anon,authenticated;
grant execute on function dabbir_private.resolve_whatsapp_customer_v1(uuid,text,text) to service_role;

-- Backfill already-persisted Meta customers only when the canonical phone has no
-- competing customer row in the same tenant. Ambiguity is intentionally left untouched.
with candidates as (
  select c.id,c.business_id,
         regexp_replace(coalesce(c.channel_handle,''),'[^0-9]','','g') as normalized_handle
  from public.dabbir_customers c
  where coalesce(c.metadata->>'source','')='whatsapp'
    and coalesce(c.metadata->>'provider','')='meta'
    and c.channel_handle is not null
), safe as (
  select x.*,'+'||x.normalized_handle as canonical_phone
  from candidates x
  where length(x.normalized_handle) between 7 and 20
    and not exists (
      select 1 from public.dabbir_customers other
      where other.business_id=x.business_id and other.id<>x.id
        and other.channel_handle=x.normalized_handle
    )
    and not exists (
      select 1 from public.dabbir_customers other
      where other.business_id=x.business_id and other.id<>x.id
        and other.phone_e164='+'||x.normalized_handle
    )
)
update public.dabbir_customers c
   set channel_handle=s.normalized_handle,
       phone_e164=coalesce(c.phone_e164,s.canonical_phone),
       updated_at=case
         when c.channel_handle is distinct from s.normalized_handle or c.phone_e164 is null then now()
         else c.updated_at
       end
from safe s
where c.id=s.id and c.business_id=s.business_id
  and (c.channel_handle is distinct from s.normalized_handle or c.phone_e164 is null);

create or replace function public.dabbir_whatsapp_persist_inbound(
  p_phone_number_id text,p_provider_message_id text,p_sender_handle text,p_display_name text,
  p_body text,p_intent text,p_occurred_at timestamptz default now()
)
returns table(business_id uuid,connection_id uuid,customer_id uuid,conversation_id uuid,message_id uuid,duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_connection public.dabbir_whatsapp_connections%rowtype;
  v_customer_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_existing public.dabbir_whatsapp_event_ledger%rowtype;
  v_event_key text;
  v_sender text:=pg_catalog.regexp_replace(pg_catalog.coalesce(p_sender_handle,''),'[^0-9]','','g');
  v_batch_id uuid;
  v_dispatch_token uuid;
  v_dispatch_request bigint;
begin
  if pg_catalog.coalesce((select auth.role()),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if pg_catalog.nullif(pg_catalog.trim(p_phone_number_id),'') is null then raise exception 'WHATSAPP_PHONE_NUMBER_ID_REQUIRED'; end if;
  if pg_catalog.nullif(pg_catalog.trim(p_provider_message_id),'') is null or pg_catalog.length(p_provider_message_id)>320 then raise exception 'WHATSAPP_PROVIDER_MESSAGE_ID_REQUIRED'; end if;
  if pg_catalog.length(v_sender) not between 7 and 20 then raise exception 'WHATSAPP_SENDER_REQUIRED'; end if;
  if pg_catalog.nullif(pg_catalog.trim(p_body),'') is null or pg_catalog.length(p_body)>4000 then raise exception 'WHATSAPP_MESSAGE_BODY_REQUIRED'; end if;

  select * into v_connection from public.dabbir_whatsapp_connections c
  where c.phone_number_id=pg_catalog.trim(p_phone_number_id) and c.status='connected' limit 1;
  if not found then raise exception 'WHATSAPP_TENANT_CONNECTION_NOT_FOUND'; end if;

  v_event_key:='inbound:'||pg_catalog.trim(p_provider_message_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_connection.business_id::text||':'||v_event_key,0));

  select * into v_existing from public.dabbir_whatsapp_event_ledger e
  where e.business_id=v_connection.business_id and e.event_key=v_event_key limit 1;
  if found then
    return query select v_existing.business_id,v_existing.connection_id,
      (select c.customer_id from public.dabbir_conversations c where c.id=v_existing.conversation_id),
      v_existing.conversation_id,v_existing.message_id,true;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_connection.business_id::text||':'||v_connection.branch_id::text||':wa-sender:'||v_sender,0));
  v_customer_id:=dabbir_private.resolve_whatsapp_customer_v1(v_connection.business_id,v_sender,p_display_name);

  select c.id into v_conversation_id from public.dabbir_conversations c
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

  insert into public.dabbir_messages(business_id,conversation_id,sender_type,body,intent,simulated)
  values(v_connection.business_id,v_conversation_id,'customer',left(trim(p_body),4000),nullif(left(trim(coalesce(p_intent,'')),120),''),false)
  returning id into v_message_id;

  insert into public.dabbir_whatsapp_event_ledger(
    business_id,connection_id,event_key,direction,event_type,provider_message_id,
    conversation_id,message_id,provider_status,provider_verified,occurred_at,verified_at,evidence
  ) values (
    v_connection.business_id,v_connection.id,v_event_key,'inbound','message',trim(p_provider_message_id),
    v_conversation_id,v_message_id,'received',true,coalesce(p_occurred_at,now()),now(),
    jsonb_build_object('source','meta_signed_webhook','signature_verified',true,'branch_id',v_connection.branch_id)
  );

  v_batch_id:=public.dabbir_enqueue_message_batch(
    v_connection.business_id,v_conversation_id,v_customer_id,'whatsapp',v_message_id,1200,false,null
  );
  v_dispatch_token:=extensions.gen_random_uuid();
  update public.dabbir_message_batches
     set dispatch_token=v_dispatch_token,dispatched_at=null,last_error=null,updated_at=now()
   where id=v_batch_id;

  begin
    v_dispatch_request:=net.http_post(
      url:='https://dabbir.bmalman.com/api/dabbir-whatsapp-ai-worker',
      body:=jsonb_build_object('dispatch_token',v_dispatch_token::text),
      params:='{}'::jsonb,
      headers:=jsonb_build_object('Content-Type','application/json','User-Agent','dabbir-pg-net/1.0'),
      timeout_milliseconds:=1000
    );
    update public.dabbir_message_batches set dispatched_at=now(),updated_at=now() where id=v_batch_id;
  exception when others then
    update public.dabbir_message_batches set last_error='FAST_DISPATCH_ENQUEUE_FAILED',updated_at=now() where id=v_batch_id;
  end;

  update public.dabbir_whatsapp_connections
     set last_verified_at=now(),last_provider_status=200,last_error=null,updated_at=now()
   where id=v_connection.id;

  return query select v_connection.business_id,v_connection.id,v_customer_id,v_conversation_id,v_message_id,false;
end;
$function$;

revoke all on function public.dabbir_whatsapp_persist_inbound(text,text,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_persist_inbound(text,text,text,text,text,text,timestamptz) to service_role;

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
set search_path='pg_catalog','public','dabbir_private','auth','extensions','net'
as $function$
declare
  v_connection public.dabbir_whatsapp_connections%rowtype;
  v_customer_id uuid;
  v_conversation_id uuid;
  v_existing public.dabbir_whatsapp_voice_ingest%rowtype;
  v_ingest public.dabbir_whatsapp_voice_ingest%rowtype;
  v_sender text:=regexp_replace(coalesce(p_sender_handle,''),'[^0-9]','','g');
  v_dispatch_request bigint;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if nullif(trim(p_phone_number_id),'') is null then raise exception 'WHATSAPP_PHONE_NUMBER_ID_REQUIRED'; end if;
  if nullif(trim(p_provider_message_id),'') is null or char_length(trim(p_provider_message_id))>320 then raise exception 'WHATSAPP_PROVIDER_MESSAGE_ID_REQUIRED'; end if;
  if length(v_sender) not between 7 and 20 then raise exception 'WHATSAPP_SENDER_REQUIRED'; end if;
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
  v_customer_id:=dabbir_private.resolve_whatsapp_customer_v1(v_connection.business_id,v_sender,p_display_name);

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
$function$;

revoke all on function public.dabbir_whatsapp_persist_voice_inbound(text,text,text,text,text,text,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_persist_voice_inbound(text,text,text,text,text,text,boolean,timestamptz) to service_role;
