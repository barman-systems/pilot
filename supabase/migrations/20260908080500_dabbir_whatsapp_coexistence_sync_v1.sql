-- DABBIR WhatsApp Coexistence v1
-- Persist WhatsApp Business App history/contact/app-echo sync without replaying
-- historical messages into the AI execution queue. Raw webhook payloads and access
-- tokens are never stored by this migration.

alter table public.dabbir_whatsapp_connections
  add column if not exists coexistence_mode text not null default 'unknown',
  add column if not exists coexistence_sync_state text not null default 'not_requested',
  add column if not exists coexistence_sync_attempts integer not null default 0,
  add column if not exists coexistence_next_retry_at timestamptz,
  add column if not exists coexistence_history_requested_at timestamptz,
  add column if not exists coexistence_history_request_id text,
  add column if not exists coexistence_history_synced_at timestamptz,
  add column if not exists coexistence_history_progress integer,
  add column if not exists coexistence_contacts_requested_at timestamptz,
  add column if not exists coexistence_contacts_request_id text,
  add column if not exists coexistence_contacts_synced_at timestamptz,
  add column if not exists coexistence_message_echo_at timestamptz,
  add column if not exists coexistence_last_event_at timestamptz,
  add column if not exists coexistence_last_error text;

alter table public.dabbir_whatsapp_connections
  drop constraint if exists dabbir_whatsapp_connections_coexistence_mode_check,
  drop constraint if exists dabbir_whatsapp_connections_coexistence_sync_state_check,
  drop constraint if exists dabbir_whatsapp_connections_coexistence_attempts_check,
  drop constraint if exists dabbir_whatsapp_connections_coexistence_progress_check;

alter table public.dabbir_whatsapp_connections
  add constraint dabbir_whatsapp_connections_coexistence_mode_check
    check (coexistence_mode in ('unknown','standard','coexistence')),
  add constraint dabbir_whatsapp_connections_coexistence_sync_state_check
    check (coexistence_sync_state in ('not_requested','requesting','requested','syncing','synced','retry','not_applicable','error')),
  add constraint dabbir_whatsapp_connections_coexistence_attempts_check
    check (coexistence_sync_attempts between 0 and 20),
  add constraint dabbir_whatsapp_connections_coexistence_progress_check
    check (coexistence_history_progress is null or coexistence_history_progress between 0 and 100);

create index if not exists dabbir_whatsapp_connections_coexistence_due_idx
  on public.dabbir_whatsapp_connections(status,coexistence_sync_state,coexistence_next_retry_at)
  where status='connected' and coexistence_sync_state in ('not_requested','retry','requesting');

create table if not exists public.dabbir_whatsapp_coexistence_mutations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  connection_id uuid not null references public.dabbir_whatsapp_connections(id) on delete cascade,
  mutation_key text not null,
  original_provider_message_id text not null,
  mutation_provider_message_id text,
  mutation_type text not null check (mutation_type in ('edit','revoke')),
  new_body text,
  occurred_at timestamptz not null default now(),
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dabbir_whatsapp_coexistence_mutation_key_len check (char_length(mutation_key) between 8 and 360),
  constraint dabbir_whatsapp_coexistence_original_id_len check (char_length(original_provider_message_id) between 3 and 320),
  constraint dabbir_whatsapp_coexistence_mutation_id_len check (mutation_provider_message_id is null or char_length(mutation_provider_message_id) between 3 and 320),
  constraint dabbir_whatsapp_coexistence_mutation_business_key_uq unique (business_id,mutation_key)
);

create index if not exists dabbir_whatsapp_coexistence_mutation_original_idx
  on public.dabbir_whatsapp_coexistence_mutations(business_id,original_provider_message_id,occurred_at desc);

alter table public.dabbir_whatsapp_coexistence_mutations enable row level security;
alter table public.dabbir_whatsapp_coexistence_mutations force row level security;
revoke all on public.dabbir_whatsapp_coexistence_mutations from public,anon,authenticated;
grant select,insert,update on public.dabbir_whatsapp_coexistence_mutations to service_role;

-- Historical imports must never create live follow-up candidates. Preserve every
-- other trigger behavior, but exempt the explicit history-sync intent.
create or replace function dabbir_private.capture_safe_internal_followup()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_business_name text;
  v_demo_mode boolean;
  v_customer_id uuid;
  v_channel_type text;
  v_followup_id uuid;
  v_due_at timestamptz;
  v_policy record;
begin
  if new.sender_type <> 'customer' or coalesce(new.simulated,false) then return new; end if;
  if coalesce(new.intent,'')='WHATSAPP_HISTORY_SYNC' then return new; end if;
  if not dabbir_private.explicit_followup_requested(new.body) then return new; end if;

  select b.name,b.demo_mode into v_business_name,v_demo_mode from public.dabbir_businesses b where b.id=new.business_id;
  if not found or coalesce(v_demo_mode,false) or v_business_name like 'DABBIR AI QA %' then return new; end if;

  select p.risk_class,p.auto_execute,p.requires_customer_confirmation,p.requires_owner_approval,p.requires_identity_verification,p.active
    into v_policy from public.dabbir_action_policies p
   where p.business_id=new.business_id and p.action_key='followup.capture_internal' limit 1;
  if not found or v_policy.active is not true or v_policy.risk_class <> 'LOW' or v_policy.auto_execute is not true
     or v_policy.requires_customer_confirmation is true or v_policy.requires_owner_approval is true
     or v_policy.requires_identity_verification is true then return new; end if;

  select c.customer_id,c.channel_type into v_customer_id,v_channel_type from public.dabbir_conversations c
   where c.id=new.conversation_id and c.business_id=new.business_id limit 1;
  if not found or v_channel_type not in ('web','whatsapp','instagram') then return new; end if;

  v_due_at := dabbir_private.followup_due_from_explicit_text(new.body,coalesce(new.created_at,now()));
  begin
    insert into public.dabbir_followups(business_id,conversation_id,customer_id,channel_type,reason,status,confidence,due_at,recommended_message,policy_state,metadata,created_at,updated_at)
    values (new.business_id,new.conversation_id,v_customer_id,v_channel_type,'customer_requested_followup','candidate',0.95,v_due_at,null,'NOT_CHECKED',
      jsonb_build_object('source','dabbir_safe_followup_autonomy_v1','source_message_id',new.id::text,'auto_captured',true,'external_side_effects',false,'detection','explicit_followup_commitment','temporal_hint',case when v_due_at is null then 'UNSPECIFIED' else 'TOMORROW' end),now(),now())
    returning id into v_followup_id;
  exception when unique_violation then
    return new;
  end;

  insert into public.dabbir_operation_outcomes(business_id,operation_key,correlation_id,operation_type,outcome,failure_class,safe_eligible,autonomous,estimated_manual_seconds,source,metadata,started_at,completed_at,created_at)
  values (new.business_id,'followup.capture_internal:'||v_followup_id::text,new.id::text,'followup.capture_internal','VERIFIED_SUCCESS',null,true,true,0,'database_trigger',
    jsonb_build_object('followup_id',v_followup_id,'source_message_id',new.id,'external_side_effects',false,'manual_seconds_measurement','UNMEASURED'),coalesce(new.created_at,now()),now(),now())
  on conflict (business_id,operation_key) do nothing;
  return new;
end;
$function$;

create or replace function public.dabbir_whatsapp_persist_coexistence_message(
  p_phone_number_id text,
  p_provider_message_id text,
  p_customer_handle text,
  p_display_name text,
  p_body text,
  p_direction text,
  p_source_field text,
  p_occurred_at timestamptz default now()
)
returns table(business_id uuid,connection_id uuid,customer_id uuid,conversation_id uuid,message_id uuid,duplicate boolean)
language plpgsql
security definer
set search_path='pg_catalog','public','dabbir_private','auth'
as $function$
declare
  v_connection public.dabbir_whatsapp_connections%rowtype;
  v_existing public.dabbir_whatsapp_event_ledger%rowtype;
  v_customer_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_handle text:=regexp_replace(coalesce(p_customer_handle,''),'[^0-9]','','g');
  v_provider text:=trim(coalesce(p_provider_message_id,''));
  v_direction text:=lower(trim(coalesce(p_direction,'')));
  v_source text:=lower(trim(coalesce(p_source_field,'')));
  v_body text:=left(trim(coalesce(p_body,'')),4000);
  v_pending record;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if nullif(trim(p_phone_number_id),'') is null then raise exception 'WHATSAPP_PHONE_NUMBER_ID_REQUIRED'; end if;
  if length(v_provider) not between 3 and 320 then raise exception 'WHATSAPP_PROVIDER_MESSAGE_ID_REQUIRED'; end if;
  if length(v_handle) not between 7 and 20 then raise exception 'WHATSAPP_CUSTOMER_HANDLE_REQUIRED'; end if;
  if v_direction not in ('inbound','outbound') then raise exception 'WHATSAPP_COEXISTENCE_DIRECTION_INVALID'; end if;
  if v_source not in ('history','smb_message_echoes') then raise exception 'WHATSAPP_COEXISTENCE_SOURCE_INVALID'; end if;
  if v_body='' then v_body:='[WhatsApp message]'; end if;

  select * into v_connection from public.dabbir_whatsapp_connections c
   where c.phone_number_id=trim(p_phone_number_id) and c.status='connected' limit 1 for update;
  if not found then raise exception 'WHATSAPP_TENANT_CONNECTION_NOT_FOUND'; end if;
  if v_connection.branch_id is null then raise exception 'WHATSAPP_CONNECTION_BRANCH_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_connection.business_id::text||':wa-provider:'||v_provider,0));
  select * into v_existing from public.dabbir_whatsapp_event_ledger e
   where e.business_id=v_connection.business_id and e.provider_message_id=v_provider
   order by e.created_at asc limit 1;
  if found then
    return query select v_existing.business_id,v_existing.connection_id,
      (select c.customer_id from public.dabbir_conversations c where c.id=v_existing.conversation_id),
      v_existing.conversation_id,v_existing.message_id,true;
    return;
  end if;

  insert into public.dabbir_customers(business_id,display_name,channel_handle,phone_e164,lead_status,metadata)
  values(v_connection.business_id,left(coalesce(nullif(trim(p_display_name),''),'WhatsApp Customer'),120),v_handle,'+'||v_handle,'new',
    jsonb_build_object('source','whatsapp','provider','meta','coexistence',true))
  on conflict (business_id,channel_handle) where channel_handle is not null
  do update set
    display_name=case when excluded.display_name<>'WhatsApp Customer' then excluded.display_name else public.dabbir_customers.display_name end,
    phone_e164=coalesce(public.dabbir_customers.phone_e164,excluded.phone_e164),
    metadata=coalesce(public.dabbir_customers.metadata,'{}'::jsonb)||jsonb_build_object('source','whatsapp','provider','meta','coexistence',true),
    updated_at=now()
  returning id into v_customer_id;

  select c.id into v_conversation_id from public.dabbir_conversations c
   where c.business_id=v_connection.business_id and c.customer_id=v_customer_id
     and c.branch_id=v_connection.branch_id and c.channel_type='whatsapp' and c.demo_mode=false and c.state<>'closed'
   order by c.updated_at desc limit 1 for update;
  if v_conversation_id is null then
    insert into public.dabbir_conversations(business_id,customer_id,channel_type,state,demo_mode,branch_id)
    values(v_connection.business_id,v_customer_id,'whatsapp','waiting_customer',false,v_connection.branch_id)
    returning id into v_conversation_id;
  end if;

  insert into public.dabbir_messages(business_id,conversation_id,sender_type,body,intent,simulated,created_at)
  values(v_connection.business_id,v_conversation_id,case when v_direction='inbound' then 'customer' else 'human' end,
    v_body,case when v_source='history' then 'WHATSAPP_HISTORY_SYNC' else 'WHATSAPP_APP_ECHO' end,false,coalesce(p_occurred_at,now()))
  returning id into v_message_id;

  insert into public.dabbir_whatsapp_event_ledger(
    business_id,connection_id,event_key,direction,event_type,provider_message_id,conversation_id,message_id,
    provider_status,provider_verified,occurred_at,verified_at,evidence
  ) values(
    v_connection.business_id,v_connection.id,'coexistence:'||v_source||':'||v_provider,v_direction,'message',v_provider,
    v_conversation_id,v_message_id,'received',true,coalesce(p_occurred_at,now()),now(),
    jsonb_build_object('source','meta_signed_webhook','signature_verified',true,'coexistence',true,'source_field',v_source,'historical',v_source='history')
  );

  -- A message sent from WhatsApp Business App is an explicit human action. Cancel
  -- only not-yet-processing AI batches so a stale AI answer cannot race the human.
  if v_source='smb_message_echoes' and v_direction='outbound' then
    update public.dabbir_message_batches
       set state='CANCELLED',last_error='SUPERSEDED_BY_WHATSAPP_BUSINESS_APP_REPLY',
           lock_token=null,locked_until=null,updated_at=now()
     where business_id=v_connection.business_id and conversation_id=v_conversation_id
       and state in ('OPEN','READY','RETRY');
    update public.dabbir_conversations c
       set state=case when exists(
         select 1 from public.dabbir_handoffs h
          where h.business_id=c.business_id and h.conversation_id=c.id
            and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')
       ) then c.state else 'waiting_customer' end,
       updated_at=now()
     where c.business_id=v_connection.business_id and c.id=v_conversation_id;
  end if;

  -- Apply any edit/revoke that arrived before the historical/original message.
  for v_pending in
    select m.* from public.dabbir_whatsapp_coexistence_mutations m
     where m.business_id=v_connection.business_id and m.original_provider_message_id=v_provider and m.applied_at is null
     order by m.occurred_at asc,m.created_at asc
  loop
    update public.dabbir_messages
       set body=case when v_pending.mutation_type='revoke' then '[WhatsApp message revoked]' else left(coalesce(nullif(trim(v_pending.new_body),''),'[WhatsApp message edited]'),4000) end
     where id=v_message_id and business_id=v_connection.business_id;
    update public.dabbir_whatsapp_coexistence_mutations set applied_at=now(),updated_at=now() where id=v_pending.id;
  end loop;

  update public.dabbir_whatsapp_connections
     set coexistence_mode='coexistence',
         coexistence_message_echo_at=case when v_source='smb_message_echoes' then coalesce(p_occurred_at,now()) else coexistence_message_echo_at end,
         coexistence_last_event_at=greatest(coalesce(coexistence_last_event_at,'epoch'::timestamptz),coalesce(p_occurred_at,now())),
         updated_at=now()
   where id=v_connection.id;

  return query select v_connection.business_id,v_connection.id,v_customer_id,v_conversation_id,v_message_id,false;
end;
$function$;

create or replace function public.dabbir_whatsapp_apply_coexistence_contact_sync(
  p_phone_number_id text,
  p_customer_handle text,
  p_display_name text,
  p_action text,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $function$
declare
  v_connection public.dabbir_whatsapp_connections%rowtype;
  v_handle text:=regexp_replace(coalesce(p_customer_handle,''),'[^0-9]','','g');
  v_action text:=lower(trim(coalesce(p_action,'add')));
  v_customer uuid;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if length(v_handle) not between 7 and 20 then raise exception 'WHATSAPP_CUSTOMER_HANDLE_REQUIRED'; end if;
  if v_action not in ('add','remove') then raise exception 'WHATSAPP_CONTACT_SYNC_ACTION_INVALID'; end if;
  select * into v_connection from public.dabbir_whatsapp_connections c
   where c.phone_number_id=trim(p_phone_number_id) and c.status='connected' limit 1 for update;
  if not found then raise exception 'WHATSAPP_TENANT_CONNECTION_NOT_FOUND'; end if;

  if v_action='add' then
    insert into public.dabbir_customers(business_id,display_name,channel_handle,phone_e164,lead_status,metadata)
    values(v_connection.business_id,left(coalesce(nullif(trim(p_display_name),''),'WhatsApp Customer'),120),v_handle,'+'||v_handle,'new',
      jsonb_build_object('source','whatsapp','provider','meta','coexistence_contact',true,'whatsapp_app_contact_removed',false))
    on conflict (business_id,channel_handle) where channel_handle is not null
    do update set
      display_name=case when excluded.display_name<>'WhatsApp Customer' then excluded.display_name else public.dabbir_customers.display_name end,
      phone_e164=coalesce(public.dabbir_customers.phone_e164,excluded.phone_e164),
      metadata=(coalesce(public.dabbir_customers.metadata,'{}'::jsonb)||jsonb_build_object('source','whatsapp','provider','meta','coexistence_contact',true,'whatsapp_app_contact_removed',false)) - 'whatsapp_app_contact_removed_at',
      updated_at=now()
    returning id into v_customer;
  else
    update public.dabbir_customers
       set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('whatsapp_app_contact_removed',true,'whatsapp_app_contact_removed_at',coalesce(p_occurred_at,now())),updated_at=now()
     where business_id=v_connection.business_id and channel_handle=v_handle
     returning id into v_customer;
  end if;

  update public.dabbir_whatsapp_connections
     set coexistence_mode='coexistence',coexistence_contacts_synced_at=coalesce(p_occurred_at,now()),
         coexistence_last_event_at=greatest(coalesce(coexistence_last_event_at,'epoch'::timestamptz),coalesce(p_occurred_at,now())),updated_at=now()
   where id=v_connection.id;
  return jsonb_build_object('applied',true,'customer_id',v_customer,'action',v_action);
end;
$function$;

create or replace function public.dabbir_whatsapp_apply_coexistence_mutation(
  p_phone_number_id text,
  p_original_provider_message_id text,
  p_mutation_provider_message_id text,
  p_mutation_type text,
  p_new_body text,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $function$
declare
  v_connection public.dabbir_whatsapp_connections%rowtype;
  v_event public.dabbir_whatsapp_event_ledger%rowtype;
  v_type text:=lower(trim(coalesce(p_mutation_type,'')));
  v_original text:=trim(coalesce(p_original_provider_message_id,''));
  v_mutation text:=nullif(trim(coalesce(p_mutation_provider_message_id,'')),'');
  v_key text;
  v_row public.dabbir_whatsapp_coexistence_mutations%rowtype;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if v_type not in ('edit','revoke') then raise exception 'WHATSAPP_MUTATION_TYPE_INVALID'; end if;
  if length(v_original) not between 3 and 320 then raise exception 'WHATSAPP_ORIGINAL_MESSAGE_ID_REQUIRED'; end if;
  select * into v_connection from public.dabbir_whatsapp_connections c
   where c.phone_number_id=trim(p_phone_number_id) and c.status='connected' limit 1 for update;
  if not found then raise exception 'WHATSAPP_TENANT_CONNECTION_NOT_FOUND'; end if;
  v_key:=v_type||':'||coalesce(v_mutation,v_original||':'||extract(epoch from coalesce(p_occurred_at,now()))::bigint::text);

  insert into public.dabbir_whatsapp_coexistence_mutations(
    business_id,connection_id,mutation_key,original_provider_message_id,mutation_provider_message_id,mutation_type,new_body,occurred_at
  ) values(v_connection.business_id,v_connection.id,v_key,v_original,v_mutation,v_type,
    case when v_type='edit' then left(coalesce(p_new_body,''),4000) else null end,coalesce(p_occurred_at,now()))
  on conflict (business_id,mutation_key) do update set updated_at=now()
  returning * into v_row;

  select * into v_event from public.dabbir_whatsapp_event_ledger e
   where e.business_id=v_connection.business_id and e.provider_message_id=v_original and e.message_id is not null
   order by e.created_at asc limit 1;
  if found then
    update public.dabbir_messages
       set body=case when v_type='revoke' then '[WhatsApp message revoked]' else left(coalesce(nullif(trim(p_new_body),''),'[WhatsApp message edited]'),4000) end
     where business_id=v_connection.business_id and id=v_event.message_id;
    update public.dabbir_whatsapp_coexistence_mutations set applied_at=now(),updated_at=now() where id=v_row.id;
  end if;
  update public.dabbir_whatsapp_connections set coexistence_mode='coexistence',coexistence_last_event_at=coalesce(p_occurred_at,now()),updated_at=now() where id=v_connection.id;
  return jsonb_build_object('applied',found,'queued',not found,'mutation_id',v_row.id);
end;
$function$;

create or replace function public.dabbir_whatsapp_mark_coexistence_sync(
  p_phone_number_id text,
  p_kind text,
  p_state text,
  p_request_id text default null,
  p_progress integer default null,
  p_error text default null,
  p_next_retry_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $function$
declare
  v_connection public.dabbir_whatsapp_connections%rowtype;
  v_kind text:=lower(trim(coalesce(p_kind,'')));
  v_state text:=lower(trim(coalesce(p_state,'')));
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if v_kind not in ('mode','history_request','contacts_request','history_event','contacts_event','error') then raise exception 'WHATSAPP_COEXISTENCE_SYNC_KIND_INVALID'; end if;
  select * into v_connection from public.dabbir_whatsapp_connections c where c.phone_number_id=trim(p_phone_number_id) limit 1 for update;
  if not found then raise exception 'WHATSAPP_TENANT_CONNECTION_NOT_FOUND'; end if;

  update public.dabbir_whatsapp_connections c set
    coexistence_mode=case when v_kind='mode' and v_state='standard' then 'standard' when v_kind='mode' or v_kind<>'error' then 'coexistence' else c.coexistence_mode end,
    coexistence_sync_state=case
      when v_kind='mode' and v_state='standard' then 'not_applicable'
      when v_state in ('retry','error') then v_state
      when v_kind in ('history_request','contacts_request') then 'requested'
      when v_kind in ('history_event','contacts_event') and coalesce(p_progress,100)>=100 then 'synced'
      when v_kind in ('history_event','contacts_event') then 'syncing'
      else c.coexistence_sync_state end,
    coexistence_sync_attempts=case when v_state in ('retry','error') then least(20,c.coexistence_sync_attempts+1) else c.coexistence_sync_attempts end,
    coexistence_next_retry_at=case when v_state='retry' then p_next_retry_at else null end,
    coexistence_history_requested_at=case when v_kind='history_request' then coalesce(c.coexistence_history_requested_at,now()) else c.coexistence_history_requested_at end,
    coexistence_history_request_id=case when v_kind='history_request' then coalesce(nullif(left(trim(coalesce(p_request_id,'')),320),''),c.coexistence_history_request_id) else c.coexistence_history_request_id end,
    coexistence_contacts_requested_at=case when v_kind='contacts_request' then coalesce(c.coexistence_contacts_requested_at,now()) else c.coexistence_contacts_requested_at end,
    coexistence_contacts_request_id=case when v_kind='contacts_request' then coalesce(nullif(left(trim(coalesce(p_request_id,'')),320),''),c.coexistence_contacts_request_id) else c.coexistence_contacts_request_id end,
    coexistence_history_progress=case when v_kind='history_event' then greatest(coalesce(c.coexistence_history_progress,0),greatest(0,least(100,coalesce(p_progress,0)))) else c.coexistence_history_progress end,
    coexistence_history_synced_at=case when v_kind='history_event' and coalesce(p_progress,100)>=100 then now() else c.coexistence_history_synced_at end,
    coexistence_contacts_synced_at=case when v_kind='contacts_event' then now() else c.coexistence_contacts_synced_at end,
    coexistence_last_event_at=case when v_kind in ('history_event','contacts_event') then now() else c.coexistence_last_event_at end,
    coexistence_last_error=case when v_state in ('retry','error') then left(coalesce(p_error,'COEXISTENCE_SYNC_FAILED'),300) else null end,
    updated_at=now()
   where c.id=v_connection.id;
  return jsonb_build_object('ok',true,'connection_id',v_connection.id,'kind',v_kind,'state',v_state);
end;
$function$;

revoke all on function public.dabbir_whatsapp_persist_coexistence_message(text,text,text,text,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.dabbir_whatsapp_apply_coexistence_contact_sync(text,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.dabbir_whatsapp_apply_coexistence_mutation(text,text,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.dabbir_whatsapp_mark_coexistence_sync(text,text,text,text,integer,text,timestamptz) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_persist_coexistence_message(text,text,text,text,text,text,text,timestamptz) to service_role;
grant execute on function public.dabbir_whatsapp_apply_coexistence_contact_sync(text,text,text,text,timestamptz) to service_role;
grant execute on function public.dabbir_whatsapp_apply_coexistence_mutation(text,text,text,text,text,timestamptz) to service_role;
grant execute on function public.dabbir_whatsapp_mark_coexistence_sync(text,text,text,text,integer,text,timestamptz) to service_role;
