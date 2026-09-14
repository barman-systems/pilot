-- DABBIR product analytics delivery v1.
-- DABBIR/Supabase remains the operational source of truth.
-- PostHog receives a privacy-minimized, idempotent mirror of five activation milestones.
-- Telemetry failures must never block auth, messaging, business creation, or AI actions.

create table if not exists public.dabbir_posthog_product_event_outbox_v1 (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_name text not null,
  distinct_id text not null,
  actor_user_id uuid,
  business_id uuid references public.dabbir_businesses(id) on delete set null,
  activity_type text,
  channel text,
  action_type text,
  setup_version text,
  occurred_at timestamptz not null,
  posthog_request_id bigint,
  posthog_enqueued_at timestamptz,
  posthog_delivered_at timestamptz,
  posthog_attempts integer not null default 0,
  posthog_last_error text,
  created_at timestamptz not null default now(),
  constraint dabbir_posthog_product_event_name_check check (
    event_name in ('signup_completed','business_setup_completed','first_request_received','first_action_completed','returning_user')
  ),
  constraint dabbir_posthog_product_event_key_check check (char_length(event_key) between 8 and 220),
  constraint dabbir_posthog_product_distinct_id_check check (char_length(distinct_id) between 3 and 200),
  constraint dabbir_posthog_product_attempts_check check (posthog_attempts between 0 and 20)
);

create index if not exists dabbir_posthog_product_event_delivery_idx
  on public.dabbir_posthog_product_event_outbox_v1(posthog_delivered_at, posthog_request_id, posthog_attempts, occurred_at);
create index if not exists dabbir_posthog_product_event_business_idx
  on public.dabbir_posthog_product_event_outbox_v1(business_id, event_name, occurred_at)
  where business_id is not null;

alter table public.dabbir_posthog_product_event_outbox_v1 enable row level security;
revoke all on table public.dabbir_posthog_product_event_outbox_v1 from public, anon, authenticated;
grant select, insert, update, delete on table public.dabbir_posthog_product_event_outbox_v1 to service_role;

create or replace function dabbir_private.enqueue_posthog_product_event_v1(
  p_event_key text,
  p_event_name text,
  p_distinct_id text,
  p_actor_user_id uuid,
  p_business_id uuid,
  p_activity_type text,
  p_channel text,
  p_action_type text,
  p_setup_version text,
  p_occurred_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_token text;
  v_request_id bigint;
begin
  if p_event_name not in ('signup_completed','business_setup_completed','first_request_received','first_action_completed','returning_user') then
    return null;
  end if;
  if nullif(btrim(coalesce(p_event_key,'')),'') is null or nullif(btrim(coalesce(p_distinct_id,'')),'') is null then
    return null;
  end if;

  insert into public.dabbir_posthog_product_event_outbox_v1(
    event_key,event_name,distinct_id,actor_user_id,business_id,activity_type,channel,action_type,setup_version,occurred_at
  ) values (
    left(btrim(p_event_key),220),p_event_name,left(btrim(p_distinct_id),200),p_actor_user_id,p_business_id,
    nullif(left(btrim(coalesce(p_activity_type,'')),120),''),
    nullif(left(btrim(coalesce(p_channel,'')),120),''),
    nullif(left(btrim(coalesce(p_action_type,'')),120),''),
    nullif(left(btrim(coalesce(p_setup_version,'')),120),''),
    coalesce(p_occurred_at,now())
  )
  on conflict(event_key) do nothing
  returning id into v_id;

  if v_id is null then
    select o.id into v_id
    from public.dabbir_posthog_product_event_outbox_v1 o
    where o.event_key=left(btrim(p_event_key),220);
    return v_id;
  end if;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name='DABBIR_POSTHOG_PROJECT_TOKEN'
  order by created_at desc
  limit 1;

  if nullif(btrim(coalesce(v_token,'')),'') is null then
    return v_id;
  end if;

  begin
    select net.http_post(
      url:='https://eu.i.posthog.com/i/v0/e/',
      body:=jsonb_build_object(
        'api_key',v_token,
        'event',p_event_name,
        'distinct_id',left(btrim(p_distinct_id),200),
        'uuid',v_id::text,
        'timestamp',coalesce(p_occurred_at,now()),
        'properties',jsonb_strip_nulls(jsonb_build_object(
          '$process_person_profile',false,
          'activity_type',nullif(left(btrim(coalesce(p_activity_type,'')),120),''),
          'channel',nullif(left(btrim(coalesce(p_channel,'')),120),''),
          'action_type',nullif(left(btrim(coalesce(p_action_type,'')),120),''),
          'setup_version',nullif(left(btrim(coalesce(p_setup_version,'')),120),''),
          'source','dabbir_server_truth'
        ))
      ),
      params:='{}'::jsonb,
      headers:='{"Content-Type":"application/json"}'::jsonb,
      timeout_milliseconds:=3000
    ) into v_request_id;
    update public.dabbir_posthog_product_event_outbox_v1
      set posthog_request_id=v_request_id,posthog_enqueued_at=now(),posthog_attempts=posthog_attempts+1,posthog_last_error=null
      where id=v_id;
  exception when others then
    update public.dabbir_posthog_product_event_outbox_v1
      set posthog_attempts=least(posthog_attempts+1,20),posthog_last_error=left(sqlerrm,240)
      where id=v_id;
  end;

  return v_id;
end;
$$;
revoke all on function dabbir_private.enqueue_posthog_product_event_v1(text,text,text,uuid,uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function dabbir_private.enqueue_posthog_product_event_v1(text,text,text,uuid,uuid,text,text,text,text,timestamptz) to service_role;

create or replace function dabbir_private.flush_posthog_product_outbox_v1(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_token text;
  v_row record;
  v_request_id bigint;
  v_delivered integer:=0;
  v_requeued integer:=0;
  v_enqueued integer:=0;
begin
  p_limit:=greatest(1,least(coalesce(p_limit,100),500));
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name='DABBIR_POSTHOG_PROJECT_TOKEN'
  order by created_at desc
  limit 1;
  if nullif(btrim(coalesce(v_token,'')),'') is null then
    return jsonb_build_object('ok',false,'state','POSTHOG_TOKEN_MISSING');
  end if;

  for v_row in
    select o.id,o.posthog_request_id,r.status_code,r.timed_out,r.error_msg
    from public.dabbir_posthog_product_event_outbox_v1 o
    join net._http_response r on r.id=o.posthog_request_id
    where o.posthog_delivered_at is null and o.posthog_request_id is not null
    order by o.posthog_enqueued_at asc nulls first
    limit p_limit
  loop
    if coalesce(v_row.timed_out,false)=false and v_row.status_code between 200 and 299 then
      update public.dabbir_posthog_product_event_outbox_v1
        set posthog_delivered_at=now(),posthog_last_error=null
        where id=v_row.id;
      v_delivered:=v_delivered+1;
    else
      update public.dabbir_posthog_product_event_outbox_v1
        set posthog_request_id=null,
            posthog_last_error=left(coalesce(v_row.error_msg,'HTTP_'||coalesce(v_row.status_code::text,'UNKNOWN')),240)
        where id=v_row.id;
      v_requeued:=v_requeued+1;
    end if;
  end loop;

  for v_row in
    select o.*
    from public.dabbir_posthog_product_event_outbox_v1 o
    where o.posthog_delivered_at is null
      and o.posthog_request_id is null
      and o.posthog_attempts<5
    order by o.occurred_at asc,o.id
    limit p_limit
  loop
    begin
      select net.http_post(
        url:='https://eu.i.posthog.com/i/v0/e/',
        body:=jsonb_build_object(
          'api_key',v_token,
          'event',v_row.event_name,
          'distinct_id',v_row.distinct_id,
          'uuid',v_row.id::text,
          'timestamp',v_row.occurred_at,
          'properties',jsonb_strip_nulls(jsonb_build_object(
            '$process_person_profile',false,
            'activity_type',v_row.activity_type,
            'channel',v_row.channel,
            'action_type',v_row.action_type,
            'setup_version',v_row.setup_version,
            'source','dabbir_server_truth'
          ))
        ),
        params:='{}'::jsonb,
        headers:='{"Content-Type":"application/json"}'::jsonb,
        timeout_milliseconds:=3000
      ) into v_request_id;
      update public.dabbir_posthog_product_event_outbox_v1
        set posthog_request_id=v_request_id,posthog_enqueued_at=now(),posthog_attempts=posthog_attempts+1,posthog_last_error=null
        where id=v_row.id;
      v_enqueued:=v_enqueued+1;
    exception when others then
      update public.dabbir_posthog_product_event_outbox_v1
        set posthog_attempts=least(posthog_attempts+1,20),posthog_last_error=left(sqlerrm,240)
        where id=v_row.id;
    end;
  end loop;

  return jsonb_build_object('ok',true,'delivered',v_delivered,'requeued',v_requeued,'enqueued',v_enqueued);
end;
$$;
revoke all on function dabbir_private.flush_posthog_product_outbox_v1(integer) from public,anon,authenticated;
grant execute on function dabbir_private.flush_posthog_product_outbox_v1(integer) to service_role;

create or replace function dabbir_private.posthog_signup_milestone_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if upper(coalesce(new.raw_user_meta_data->>'product',new.raw_app_meta_data->>'product',''))<>'DABBIR' then return new; end if;
  begin
    perform dabbir_private.enqueue_posthog_product_event_v1(
      'signup_completed:user:'||new.id::text,'signup_completed','user:'||new.id::text,new.id,null,null,'auth',null,'auth_users_v1',coalesce(new.created_at,now())
    );
  exception when others then null; end;
  return new;
end;
$$;
revoke all on function dabbir_private.posthog_signup_milestone_trigger_v1() from public,anon,authenticated;

drop trigger if exists dabbir_posthog_signup_milestone_v1 on auth.users;
create trigger dabbir_posthog_signup_milestone_v1
after insert on auth.users
for each row execute function dabbir_private.posthog_signup_milestone_trigger_v1();

create or replace function dabbir_private.posthog_returning_user_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_is_dabbir boolean:=false;
begin
  select (
    upper(coalesce(u.raw_user_meta_data->>'product',u.raw_app_meta_data->>'product',''))='DABBIR'
    or exists(select 1 from public.dabbir_memberships m where m.user_id=new.user_id)
  ) into v_is_dabbir
  from auth.users u where u.id=new.user_id;
  if not coalesce(v_is_dabbir,false) then return new; end if;
  if not exists(select 1 from auth.sessions s where s.user_id=new.user_id and s.id<>new.id and s.created_at<new.created_at) then return new; end if;
  begin
    perform dabbir_private.enqueue_posthog_product_event_v1(
      'returning_user:user:'||new.user_id::text,'returning_user','user:'||new.user_id::text,new.user_id,null,null,'auth',null,'auth_sessions_v1',coalesce(new.created_at,now())
    );
  exception when others then null; end;
  return new;
end;
$$;
revoke all on function dabbir_private.posthog_returning_user_trigger_v1() from public,anon,authenticated;

drop trigger if exists dabbir_posthog_returning_user_v1 on auth.sessions;
create trigger dabbir_posthog_returning_user_v1
after insert on auth.sessions
for each row execute function dabbir_private.posthog_returning_user_trigger_v1();

create or replace function dabbir_private.posthog_business_setup_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if coalesce(new.demo_mode,false) then return new; end if;
  if tg_op='UPDATE' and coalesce(old.demo_mode,false)=false then return new; end if;
  begin
    perform dabbir_private.enqueue_posthog_product_event_v1(
      'business_setup_completed:business:'||new.id::text,'business_setup_completed','business:'||new.id::text,new.owner_id,new.id,new.business_type,'business_setup',null,'business_v1',coalesce(new.created_at,now())
    );
  exception when others then null; end;
  return new;
end;
$$;
revoke all on function dabbir_private.posthog_business_setup_trigger_v1() from public,anon,authenticated;

drop trigger if exists dabbir_posthog_business_setup_v1 on public.dabbir_businesses;
create trigger dabbir_posthog_business_setup_v1
after insert or update of demo_mode on public.dabbir_businesses
for each row execute function dabbir_private.posthog_business_setup_trigger_v1();

create or replace function dabbir_private.posthog_first_request_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_owner uuid;v_activity text;v_channel text;
begin
  if new.sender_type<>'customer' or coalesce(new.simulated,false) then return new; end if;
  select b.owner_id,b.business_type,c.channel_type into v_owner,v_activity,v_channel
  from public.dabbir_businesses b
  left join public.dabbir_conversations c on c.business_id=new.business_id and c.id=new.conversation_id
  where b.id=new.business_id and coalesce(b.demo_mode,false)=false;
  if not found then return new; end if;
  begin
    perform dabbir_private.enqueue_posthog_product_event_v1(
      'first_request_received:business:'||new.business_id::text,'first_request_received','business:'||new.business_id::text,v_owner,new.business_id,v_activity,v_channel,null,'messages_v1',coalesce(new.created_at,now())
    );
  exception when others then null; end;
  return new;
end;
$$;
revoke all on function dabbir_private.posthog_first_request_trigger_v1() from public,anon,authenticated;

drop trigger if exists dabbir_posthog_first_request_v1 on public.dabbir_messages;
create trigger dabbir_posthog_first_request_v1
after insert on public.dabbir_messages
for each row execute function dabbir_private.posthog_first_request_trigger_v1();

create or replace function dabbir_private.posthog_first_action_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_owner uuid;v_activity text;
begin
  if lower(coalesce(new.result->>'verified','false'))<>'true' then return new; end if;
  select b.owner_id,b.business_type into v_owner,v_activity
  from public.dabbir_businesses b
  where b.id=new.business_id and coalesce(b.demo_mode,false)=false;
  if not found then return new; end if;
  begin
    perform dabbir_private.enqueue_posthog_product_event_v1(
      'first_action_completed:business:'||new.business_id::text,'first_action_completed','business:'||new.business_id::text,v_owner,new.business_id,v_activity,'ai_operator',new.operation_type,'ai_action_ledger_v1',coalesce(new.created_at,now())
    );
  exception when others then null; end;
  return new;
end;
$$;
revoke all on function dabbir_private.posthog_first_action_trigger_v1() from public,anon,authenticated;

drop trigger if exists dabbir_posthog_first_action_v1 on public.dabbir_ai_action_ledger;
create trigger dabbir_posthog_first_action_v1
after insert on public.dabbir_ai_action_ledger
for each row execute function dabbir_private.posthog_first_action_trigger_v1();

-- Backfill one canonical event per milestone from durable production evidence.
select dabbir_private.enqueue_posthog_product_event_v1(
  'signup_completed:user:'||u.id::text,'signup_completed','user:'||u.id::text,u.id,null,null,'auth',null,'auth_users_v1',coalesce(u.created_at,now())
)
from auth.users u
where u.deleted_at is null
  and (
    upper(coalesce(u.raw_user_meta_data->>'product',u.raw_app_meta_data->>'product',''))='DABBIR'
    or exists(select 1 from public.dabbir_memberships m where m.user_id=u.id)
  );

with ranked as (
  select s.user_id,s.created_at,s.id,row_number() over(partition by s.user_id order by s.created_at,s.id) rn
  from auth.sessions s
), second_sessions as (
  select r.user_id,r.created_at from ranked r where r.rn=2
)
select dabbir_private.enqueue_posthog_product_event_v1(
  'returning_user:user:'||ss.user_id::text,'returning_user','user:'||ss.user_id::text,ss.user_id,null,null,'auth',null,'auth_sessions_v1',ss.created_at
)
from second_sessions ss
where exists(
  select 1 from auth.users u
  where u.id=ss.user_id and u.deleted_at is null
    and (
      upper(coalesce(u.raw_user_meta_data->>'product',u.raw_app_meta_data->>'product',''))='DABBIR'
      or exists(select 1 from public.dabbir_memberships m where m.user_id=u.id)
    )
);

select dabbir_private.enqueue_posthog_product_event_v1(
  'business_setup_completed:business:'||b.id::text,'business_setup_completed','business:'||b.id::text,b.owner_id,b.id,b.business_type,'business_setup',null,'business_v1',coalesce(b.created_at,now())
)
from public.dabbir_businesses b
where coalesce(b.demo_mode,false)=false;

with first_request as (
  select distinct on (m.business_id)
    m.business_id,m.created_at,b.owner_id,b.business_type,c.channel_type
  from public.dabbir_messages m
  join public.dabbir_businesses b on b.id=m.business_id and coalesce(b.demo_mode,false)=false
  left join public.dabbir_conversations c on c.business_id=m.business_id and c.id=m.conversation_id
  where m.sender_type='customer' and coalesce(m.simulated,false)=false
  order by m.business_id,m.created_at,m.id
)
select dabbir_private.enqueue_posthog_product_event_v1(
  'first_request_received:business:'||f.business_id::text,'first_request_received','business:'||f.business_id::text,f.owner_id,f.business_id,f.business_type,f.channel_type,null,'messages_v1',f.created_at
)
from first_request f;

with first_action as (
  select distinct on (l.business_id)
    l.business_id,l.created_at,l.operation_type,b.owner_id,b.business_type
  from public.dabbir_ai_action_ledger l
  join public.dabbir_businesses b on b.id=l.business_id and coalesce(b.demo_mode,false)=false
  where lower(coalesce(l.result->>'verified','false'))='true'
  order by l.business_id,l.created_at,l.id
)
select dabbir_private.enqueue_posthog_product_event_v1(
  'first_action_completed:business:'||f.business_id::text,'first_action_completed','business:'||f.business_id::text,f.owner_id,f.business_id,f.business_type,'ai_operator',f.operation_type,'ai_action_ledger_v1',f.created_at
)
from first_action f;

-- Flush unresolved rows periodically. If the Vault token is absent, rows remain queued safely.
do $$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname='dabbir-posthog-product-outbox-v1' limit 1;
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
  perform cron.schedule(
    'dabbir-posthog-product-outbox-v1',
    '*/5 * * * *',
    'select dabbir_private.flush_posthog_product_outbox_v1(200);'
  );
end;
$$;

comment on table public.dabbir_posthog_product_event_outbox_v1 is
  'Delivery-only outbox for privacy-minimized PostHog activation milestones. DABBIR operational tables remain authoritative.';
