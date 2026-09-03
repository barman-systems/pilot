-- Idempotent action execution and webhook enqueue adapter.
create table if not exists public.dabbir_action_idempotency (
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  action_key text not null,
  action_name text not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (business_id, action_key),
  constraint dabbir_action_idempotency_key_check check (length(trim(action_key)) between 16 and 180)
);
alter table public.dabbir_action_idempotency enable row level security;
alter table public.dabbir_action_idempotency force row level security;
revoke all on table public.dabbir_action_idempotency from public,anon,authenticated;
grant select,insert,update,delete on table public.dabbir_action_idempotency to service_role;

create or replace function public.dabbir_ai_enqueue_whatsapp_event(
  p_phone_number_id text,
  p_conversation_id uuid,
  p_message_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path=pg_catalog,public
as $$
declare v_business_id uuid;
begin
  select c.business_id into v_business_id
  from public.dabbir_whatsapp_connections c
  where c.phone_number_id=trim(coalesce(p_phone_number_id,'')) and c.status='connected'
  limit 1;
  if v_business_id is null then raise exception 'WHATSAPP_TENANT_CONNECTION_NOT_FOUND'; end if;
  return public.dabbir_ai_enqueue_action_job(v_business_id,p_conversation_id,p_message_id);
end;
$$;
revoke all on function public.dabbir_ai_enqueue_whatsapp_event(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.dabbir_ai_enqueue_whatsapp_event(text,uuid,uuid) to service_role;

create or replace function public.dabbir_action_create_booking_idempotent(
  p_business_id uuid,
  p_conversation_id uuid,
  p_service_id uuid default null,
  p_worker_id uuid default null,
  p_starts_at timestamptz default null,
  p_notes text default '',
  p_action_key text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog,public
as $$
declare v_key text:=trim(coalesce(p_action_key,'')); v_result jsonb;
begin
  if length(v_key) not between 16 and 180 then raise exception 'ACTION_IDEMPOTENCY_KEY_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':action:'||v_key,0));
  select i.result into v_result
  from public.dabbir_action_idempotency i
  where i.business_id=p_business_id and i.action_key=v_key and i.action_name='CREATE_BOOKING';
  if found then return v_result||jsonb_build_object('duplicate',true); end if;

  v_result:=public.dabbir_action_create_booking(
    p_business_id,p_conversation_id,p_service_id,p_worker_id,p_starts_at,p_notes
  );
  insert into public.dabbir_action_idempotency(business_id,action_key,action_name,result)
  values(p_business_id,v_key,'CREATE_BOOKING',v_result);
  return v_result||jsonb_build_object('duplicate',false);
end;
$$;
revoke all on function public.dabbir_action_create_booking_idempotent(uuid,uuid,uuid,uuid,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_action_create_booking_idempotent(uuid,uuid,uuid,uuid,timestamptz,text,text) to service_role;
