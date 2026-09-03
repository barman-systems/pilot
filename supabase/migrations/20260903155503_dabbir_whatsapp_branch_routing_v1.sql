alter table public.dabbir_whatsapp_connections
  add column if not exists branch_id uuid;

update public.dabbir_whatsapp_connections c
set branch_id=dabbir_private.primary_branch_for_business(c.business_id)
where c.branch_id is null;

alter table public.dabbir_whatsapp_connections
  alter column branch_id set not null;

alter table public.dabbir_whatsapp_connections
  drop constraint if exists dabbir_whatsapp_connections_business_id_key;

alter table public.dabbir_whatsapp_connections
  drop constraint if exists dabbir_whatsapp_connections_branch_business_fkey;

alter table public.dabbir_whatsapp_connections
  add constraint dabbir_whatsapp_connections_branch_business_fkey
  foreign key (branch_id,business_id)
  references public.dabbir_business_branches(id,business_id)
  on delete restrict;

alter table public.dabbir_whatsapp_connections
  add constraint dabbir_whatsapp_connections_business_branch_key
  unique (business_id,branch_id);

create index if not exists dabbir_whatsapp_connections_branch_idx
  on public.dabbir_whatsapp_connections(branch_id);

drop trigger if exists dabbir_whatsapp_connection_branch_guard on public.dabbir_whatsapp_connections;
create trigger dabbir_whatsapp_connection_branch_guard
before insert or update of business_id,branch_id on public.dabbir_whatsapp_connections
for each row execute function dabbir_private.ensure_operational_branch();

create or replace function public.dabbir_whatsapp_upsert_connection(
  p_business_id uuid,p_provider text,p_status text,p_meta_app_id text,p_waba_id text,
  p_phone_number_id text,p_display_phone_number text,p_verified_name text,
  p_access_token_ciphertext text,p_access_token_iv text,p_access_token_tag text,
  p_token_expires_at timestamptz,p_token_key_version text,p_connected_by uuid,
  p_connected_at timestamptz,p_last_verified_at timestamptz,p_last_provider_status integer,p_last_error text
)
returns setof public.dabbir_whatsapp_connections
language plpgsql
security invoker
set search_path = pg_catalog, public, dabbir_private, auth
as $$
declare
  v_row public.dabbir_whatsapp_connections%rowtype;
  v_uid uuid := (select auth.uid());
  v_phone_owner uuid;
  v_branch_id uuid;
begin
  if v_uid is null then raise exception 'WHATSAPP_CONNECTION_AUTH_REQUIRED' using errcode='42501'; end if;
  if p_business_id is null or nullif(trim(p_waba_id),'') is null or nullif(trim(p_phone_number_id),'') is null then
    raise exception 'WHATSAPP_CONNECTION_REQUIRED_FIELDS' using errcode='22023';
  end if;
  if p_connected_by is distinct from v_uid then raise exception 'WHATSAPP_CONNECTION_ACTOR_MISMATCH' using errcode='42501'; end if;
  if not dabbir_private.is_active_member(p_business_id)
     or not exists (
       select 1 from public.dabbir_memberships m
       where m.business_id=p_business_id and m.user_id=v_uid and m.status='active'
         and m.suspended_at is null and m.removed_at is null
         and m.role=any(array['owner'::text,'admin'::text])
     ) then raise exception 'WHATSAPP_CONNECTION_OWNER_REQUIRED' using errcode='42501'; end if;

  v_branch_id:=dabbir_private.primary_branch_for_business(p_business_id);
  if v_branch_id is null then raise exception 'DABBIR_ACTIVE_BRANCH_REQUIRED'; end if;

  select c.business_id into v_phone_owner
  from public.dabbir_whatsapp_connections c
  where c.phone_number_id=trim(p_phone_number_id)
    and not (c.business_id=p_business_id and c.branch_id=v_branch_id)
  limit 1;
  if v_phone_owner is not null then raise exception 'WHATSAPP_PHONE_ALREADY_CONNECTED' using errcode='23505'; end if;

  begin
    insert into public.dabbir_whatsapp_connections(
      business_id,branch_id,provider,status,meta_app_id,waba_id,phone_number_id,
      display_phone_number,verified_name,access_token_ciphertext,access_token_iv,
      access_token_tag,token_expires_at,token_key_version,connected_by,connected_at,
      last_verified_at,last_provider_status,last_error,updated_at
    ) values (
      p_business_id,v_branch_id,coalesce(nullif(trim(p_provider),''),'meta'),
      coalesce(nullif(trim(p_status),''),'connected'),nullif(trim(p_meta_app_id),''),
      trim(p_waba_id),trim(p_phone_number_id),nullif(trim(p_display_phone_number),''),
      nullif(trim(p_verified_name),''),p_access_token_ciphertext,p_access_token_iv,
      p_access_token_tag,p_token_expires_at,coalesce(nullif(trim(p_token_key_version),''),'whatsapp_v1'),
      p_connected_by,coalesce(p_connected_at,now()),p_last_verified_at,p_last_provider_status,p_last_error,now()
    )
    on conflict (business_id,branch_id) do update set
      provider=excluded.provider,status=excluded.status,meta_app_id=excluded.meta_app_id,
      waba_id=excluded.waba_id,phone_number_id=excluded.phone_number_id,
      display_phone_number=excluded.display_phone_number,verified_name=excluded.verified_name,
      access_token_ciphertext=excluded.access_token_ciphertext,access_token_iv=excluded.access_token_iv,
      access_token_tag=excluded.access_token_tag,token_expires_at=excluded.token_expires_at,
      token_key_version=excluded.token_key_version,connected_by=excluded.connected_by,
      connected_at=excluded.connected_at,last_verified_at=excluded.last_verified_at,
      last_provider_status=excluded.last_provider_status,last_error=excluded.last_error,updated_at=now()
    returning * into v_row;
  exception when unique_violation then
    raise exception 'WHATSAPP_PHONE_ALREADY_CONNECTED' using errcode='23505';
  end;
  return next v_row;
end;
$$;

revoke all on function public.dabbir_whatsapp_upsert_connection(uuid,text,text,text,text,text,text,text,text,text,text,timestamptz,text,uuid,timestamptz,timestamptz,integer,text) from public,anon;
grant execute on function public.dabbir_whatsapp_upsert_connection(uuid,text,text,text,text,text,text,text,text,text,text,timestamptz,text,uuid,timestamptz,timestamptz,integer,text) to authenticated,service_role;

create or replace function public.dabbir_whatsapp_upsert_branch_connection(
  p_business_id uuid,p_branch_id uuid,p_provider text,p_status text,p_meta_app_id text,p_waba_id text,
  p_phone_number_id text,p_display_phone_number text,p_verified_name text,
  p_access_token_ciphertext text,p_access_token_iv text,p_access_token_tag text,
  p_token_expires_at timestamptz,p_token_key_version text,p_connected_by uuid,
  p_connected_at timestamptz,p_last_verified_at timestamptz,p_last_provider_status integer,p_last_error text
)
returns setof public.dabbir_whatsapp_connections
language plpgsql
security invoker
set search_path = pg_catalog, public, dabbir_private, auth
as $$
declare
  v_row public.dabbir_whatsapp_connections%rowtype;
  v_uid uuid := (select auth.uid());
  v_phone_owner uuid;
begin
  if v_uid is null then raise exception 'WHATSAPP_CONNECTION_AUTH_REQUIRED' using errcode='42501'; end if;
  if p_business_id is null or p_branch_id is null or nullif(trim(p_waba_id),'') is null or nullif(trim(p_phone_number_id),'') is null then
    raise exception 'WHATSAPP_CONNECTION_REQUIRED_FIELDS' using errcode='22023';
  end if;
  if p_connected_by is distinct from v_uid then raise exception 'WHATSAPP_CONNECTION_ACTOR_MISMATCH' using errcode='42501'; end if;
  if not dabbir_private.is_active_member(p_business_id)
     or not exists (
       select 1 from public.dabbir_memberships m
       where m.business_id=p_business_id and m.user_id=v_uid and m.status='active'
         and m.suspended_at is null and m.removed_at is null
         and m.role=any(array['owner'::text,'admin'::text])
     ) then raise exception 'WHATSAPP_CONNECTION_OWNER_REQUIRED' using errcode='42501'; end if;
  if not exists (
    select 1 from public.dabbir_business_branches b
    where b.id=p_branch_id and b.business_id=p_business_id and b.status='active'
  ) then raise exception 'WHATSAPP_BRANCH_ACCESS_REQUIRED' using errcode='42501'; end if;

  select c.business_id into v_phone_owner
  from public.dabbir_whatsapp_connections c
  where c.phone_number_id=trim(p_phone_number_id)
    and not (c.business_id=p_business_id and c.branch_id=p_branch_id)
  limit 1;
  if v_phone_owner is not null then raise exception 'WHATSAPP_PHONE_ALREADY_CONNECTED' using errcode='23505'; end if;

  begin
    insert into public.dabbir_whatsapp_connections(
      business_id,branch_id,provider,status,meta_app_id,waba_id,phone_number_id,
      display_phone_number,verified_name,access_token_ciphertext,access_token_iv,
      access_token_tag,token_expires_at,token_key_version,connected_by,connected_at,
      last_verified_at,last_provider_status,last_error,updated_at
    ) values (
      p_business_id,p_branch_id,coalesce(nullif(trim(p_provider),''),'meta'),
      coalesce(nullif(trim(p_status),''),'connected'),nullif(trim(p_meta_app_id),''),
      trim(p_waba_id),trim(p_phone_number_id),nullif(trim(p_display_phone_number),''),
      nullif(trim(p_verified_name),''),p_access_token_ciphertext,p_access_token_iv,
      p_access_token_tag,p_token_expires_at,coalesce(nullif(trim(p_token_key_version),''),'whatsapp_v1'),
      p_connected_by,coalesce(p_connected_at,now()),p_last_verified_at,p_last_provider_status,p_last_error,now()
    )
    on conflict (business_id,branch_id) do update set
      provider=excluded.provider,status=excluded.status,meta_app_id=excluded.meta_app_id,
      waba_id=excluded.waba_id,phone_number_id=excluded.phone_number_id,
      display_phone_number=excluded.display_phone_number,verified_name=excluded.verified_name,
      access_token_ciphertext=excluded.access_token_ciphertext,access_token_iv=excluded.access_token_iv,
      access_token_tag=excluded.access_token_tag,token_expires_at=excluded.token_expires_at,
      token_key_version=excluded.token_key_version,connected_by=excluded.connected_by,
      connected_at=excluded.connected_at,last_verified_at=excluded.last_verified_at,
      last_provider_status=excluded.last_provider_status,last_error=excluded.last_error,updated_at=now()
    returning * into v_row;
  exception when unique_violation then
    raise exception 'WHATSAPP_PHONE_ALREADY_CONNECTED' using errcode='23505';
  end;
  return next v_row;
end;
$$;

revoke all on function public.dabbir_whatsapp_upsert_branch_connection(uuid,uuid,text,text,text,text,text,text,text,text,text,text,timestamptz,text,uuid,timestamptz,timestamptz,integer,text) from public,anon;
grant execute on function public.dabbir_whatsapp_upsert_branch_connection(uuid,uuid,text,text,text,text,text,text,text,text,text,text,timestamptz,text,uuid,timestamptz,timestamptz,integer,text) to authenticated,service_role;

create or replace function public.dabbir_whatsapp_ai_connection(p_business_id uuid,p_connection_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_connection public.dabbir_whatsapp_connections%rowtype;
begin
  if coalesce((select auth.role()),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into v_connection from public.dabbir_whatsapp_connections
  where id=p_connection_id and business_id=p_business_id and status='connected' limit 1;
  if not found then raise exception 'WHATSAPP_TENANT_CONNECTION_NOT_FOUND'; end if;
  return jsonb_build_object(
    'id',v_connection.id,'business_id',v_connection.business_id,'branch_id',v_connection.branch_id,
    'status',v_connection.status,'phone_number_id',v_connection.phone_number_id,'waba_id',v_connection.waba_id,
    'access_token_ciphertext',v_connection.access_token_ciphertext,'access_token_iv',v_connection.access_token_iv,
    'access_token_tag',v_connection.access_token_tag,'token_key_version',v_connection.token_key_version,
    'token_expires_at',v_connection.token_expires_at
  );
end;
$$;
revoke all on function public.dabbir_whatsapp_ai_connection(uuid,uuid) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_connection(uuid,uuid) to service_role;

create or replace function public.dabbir_whatsapp_persist_inbound(
  p_phone_number_id text,p_provider_message_id text,p_sender_handle text,p_display_name text,
  p_body text,p_intent text,p_occurred_at timestamptz default now()
)
returns table(business_id uuid,connection_id uuid,customer_id uuid,conversation_id uuid,message_id uuid,duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection public.dabbir_whatsapp_connections%rowtype;
  v_customer_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_existing public.dabbir_whatsapp_event_ledger%rowtype;
  v_event_key text;
  v_name text;
  v_sender text:=trim(coalesce(p_sender_handle,''));
begin
  if nullif(trim(p_phone_number_id),'') is null then raise exception 'WHATSAPP_PHONE_NUMBER_ID_REQUIRED'; end if;
  if nullif(trim(p_provider_message_id),'') is null or length(p_provider_message_id)>320 then raise exception 'WHATSAPP_PROVIDER_MESSAGE_ID_REQUIRED'; end if;
  if nullif(v_sender,'') is null or length(v_sender)>160 then raise exception 'WHATSAPP_SENDER_REQUIRED'; end if;
  if nullif(trim(p_body),'') is null or length(p_body)>4000 then raise exception 'WHATSAPP_MESSAGE_BODY_REQUIRED'; end if;

  select * into v_connection from public.dabbir_whatsapp_connections c
  where c.phone_number_id=trim(p_phone_number_id) and c.status='connected' limit 1;
  if not found then raise exception 'WHATSAPP_TENANT_CONNECTION_NOT_FOUND'; end if;

  v_event_key:='inbound:'||trim(p_provider_message_id);
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

  v_name:=left(coalesce(nullif(trim(p_display_name),''),'WhatsApp Customer'),120);
  insert into public.dabbir_customers(business_id,display_name,channel_handle,lead_status,metadata)
  values(v_connection.business_id,v_name,v_sender,'new',jsonb_build_object('source','whatsapp','provider','meta'))
  on conflict (business_id,channel_handle) where channel_handle is not null
  do update set display_name=case when excluded.display_name<>'WhatsApp Customer' then excluded.display_name else public.dabbir_customers.display_name end,
    metadata=coalesce(public.dabbir_customers.metadata,'{}'::jsonb)||jsonb_build_object('source','whatsapp','provider','meta')
  returning id into v_customer_id;

  select c.id into v_conversation_id from public.dabbir_conversations c
  where c.business_id=v_connection.business_id and c.branch_id=v_connection.branch_id
    and c.customer_id=v_customer_id and c.channel_type='whatsapp' and c.demo_mode=false and c.state<>'closed'
  order by c.updated_at desc limit 1 for update;

  if v_conversation_id is null then
    insert into public.dabbir_conversations(business_id,branch_id,customer_id,channel_type,state,demo_mode)
    values(v_connection.business_id,v_connection.branch_id,v_customer_id,'whatsapp','ai_active',false)
    returning id into v_conversation_id;
  else
    update public.dabbir_conversations set state=case when state='waiting_customer' then 'ai_active' else state end,updated_at=now()
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

  update public.dabbir_whatsapp_connections set last_verified_at=now(),last_provider_status=200,last_error=null,updated_at=now()
  where id=v_connection.id;

  return query select v_connection.business_id,v_connection.id,v_customer_id,v_conversation_id,v_message_id,false;
end;
$$;
revoke all on function public.dabbir_whatsapp_persist_inbound(text,text,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_persist_inbound(text,text,text,text,text,text,timestamptz) to service_role;
