-- DABBIR Actions + WhatsApp AI Agent v1
-- Durable, tenant-scoped action queue; verified booking actions; immediate human handoff.
-- External WhatsApp/web bookings no longer require owner approval or a deposit to exist on the calendar.

create table if not exists public.dabbir_conversation_runtime_state (
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  conversation_id uuid not null,
  current_intent text,
  pending_action jsonb not null default '{}'::jsonb,
  offered_slots jsonb not null default '[]'::jsonb,
  last_action_result jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (business_id, conversation_id),
  foreign key (business_id, conversation_id)
    references public.dabbir_conversations(business_id, id) on delete cascade
);

alter table public.dabbir_conversation_runtime_state enable row level security;
alter table public.dabbir_conversation_runtime_state force row level security;
revoke all on table public.dabbir_conversation_runtime_state from public, anon, authenticated;
grant select, insert, update, delete on table public.dabbir_conversation_runtime_state to service_role;

create table if not exists public.dabbir_ai_action_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  conversation_id uuid not null,
  latest_message_id uuid not null,
  state text not null default 'QUEUED'
    check (state in ('QUEUED','PROCESSING','COMPLETED','FAILED','HANDOFF')),
  generation bigint not null default 1 check (generation >= 1),
  processing_generation bigint,
  attempts integer not null default 0 check (attempts between 0 and 20),
  available_at timestamptz not null default (now() + interval '2 seconds'),
  lease_expires_at timestamptz,
  action_type text,
  action_payload jsonb not null default '{}'::jsonb,
  action_result jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (business_id, conversation_id),
  foreign key (business_id, conversation_id)
    references public.dabbir_conversations(business_id, id) on delete cascade,
  foreign key (business_id, latest_message_id)
    references public.dabbir_messages(business_id, id) on delete cascade
);

create index if not exists dabbir_ai_action_jobs_ready_idx
  on public.dabbir_ai_action_jobs(state, available_at, updated_at);
create index if not exists dabbir_ai_action_jobs_business_idx
  on public.dabbir_ai_action_jobs(business_id, updated_at desc);

alter table public.dabbir_ai_action_jobs enable row level security;
alter table public.dabbir_ai_action_jobs force row level security;
revoke all on table public.dabbir_ai_action_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.dabbir_ai_action_jobs to service_role;

alter table public.dabbir_whatsapp_outbound_reservations
  add column if not exists sender_kind text not null default 'human';
alter table public.dabbir_whatsapp_outbound_reservations
  drop constraint if exists dabbir_whatsapp_outbound_sender_kind_check;
alter table public.dabbir_whatsapp_outbound_reservations
  add constraint dabbir_whatsapp_outbound_sender_kind_check
  check (sender_kind in ('human','ai'));
alter table public.dabbir_whatsapp_outbound_reservations
  alter column sender_user_id drop not null;
alter table public.dabbir_whatsapp_outbound_reservations
  drop constraint if exists dabbir_whatsapp_outbound_sender_identity_check;
alter table public.dabbir_whatsapp_outbound_reservations
  add constraint dabbir_whatsapp_outbound_sender_identity_check
  check ((sender_kind='human' and sender_user_id is not null) or (sender_kind='ai' and sender_user_id is null));

create or replace function public.dabbir_ai_may_reply(p_business_id uuid, p_conversation_id uuid)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
  select dabbir_private.has_permission(p_business_id,'reply_conversations')
    and exists(select 1 from public.dabbir_conversations c where c.id=p_conversation_id and c.business_id=p_business_id and c.state in ('ai_active','waiting_customer','action_required'))
    and not exists(select 1 from public.dabbir_handoffs h where h.business_id=p_business_id and h.conversation_id=p_conversation_id and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE'));
$$;
revoke all on function public.dabbir_ai_may_reply(uuid,uuid) from public,anon;
grant execute on function public.dabbir_ai_may_reply(uuid,uuid) to authenticated;

create or replace function dabbir_private.enforce_external_booking_confirmation_gate()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  new.confirmation_gate := 'none';
  new.owner_approval_status := 'not_required';
  new.owner_approval_requested_at := null;
  if new.booking_source in ('whatsapp','web') then
    new.owner_decision_at := null;
    new.owner_decided_by := null;
    if new.status not in ('cancelled','completed','no_show') then new.status := 'confirmed'; end if;
  end if;
  return new;
end;
$$;
revoke all on function dabbir_private.enforce_external_booking_confirmation_gate() from public,anon,authenticated;

create or replace function public.dabbir_ai_enqueue_action_job(p_business_id uuid,p_conversation_id uuid,p_message_id uuid)
returns uuid language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_job_id uuid;
begin
  if not exists(select 1 from public.dabbir_conversations c where c.business_id=p_business_id and c.id=p_conversation_id and c.channel_type='whatsapp' and c.demo_mode=false and c.state<>'closed') then raise exception 'AI_ACTION_WHATSAPP_CONVERSATION_REQUIRED'; end if;
  if not exists(select 1 from public.dabbir_messages m where m.business_id=p_business_id and m.id=p_message_id and m.conversation_id=p_conversation_id and m.sender_type='customer' and m.simulated=false) then raise exception 'AI_ACTION_CUSTOMER_MESSAGE_REQUIRED'; end if;
  insert into public.dabbir_ai_action_jobs(business_id,conversation_id,latest_message_id,state,generation,processing_generation,attempts,available_at,lease_expires_at,action_type,action_payload,action_result,last_error,completed_at,updated_at)
  values(p_business_id,p_conversation_id,p_message_id,'QUEUED',1,null,0,now()+interval '2 seconds',null,null,'{}'::jsonb,'{}'::jsonb,null,null,now())
  on conflict (business_id,conversation_id) do update set
    latest_message_id=excluded.latest_message_id,
    generation=public.dabbir_ai_action_jobs.generation+1,
    state=case when public.dabbir_ai_action_jobs.state='PROCESSING' then 'PROCESSING' else 'QUEUED' end,
    available_at=now()+interval '2 seconds',
    lease_expires_at=case when public.dabbir_ai_action_jobs.state='PROCESSING' then public.dabbir_ai_action_jobs.lease_expires_at else null end,
    action_type=null,action_payload='{}'::jsonb,action_result='{}'::jsonb,last_error=null,completed_at=null,updated_at=now()
  returning id into v_job_id;
  return v_job_id;
end;
$$;
revoke all on function public.dabbir_ai_enqueue_action_job(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.dabbir_ai_enqueue_action_job(uuid,uuid,uuid) to service_role;

create or replace function public.dabbir_ai_claim_action_jobs(p_limit integer default 8)
returns table(job_id uuid,business_id uuid,conversation_id uuid,latest_message_id uuid,processing_generation bigint,attempts integer)
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  return query with candidates as (
    select j.id from public.dabbir_ai_action_jobs j
    where (j.state='QUEUED' and j.available_at<=now()) or (j.state='PROCESSING' and j.lease_expires_at<now())
    order by j.available_at asc,j.updated_at asc for update skip locked
    limit least(greatest(coalesce(p_limit,8),1),25)
  ), claimed as (
    update public.dabbir_ai_action_jobs j set state='PROCESSING',processing_generation=j.generation,attempts=j.attempts+1,lease_expires_at=now()+interval '90 seconds',last_error=null,updated_at=now()
    from candidates c where j.id=c.id returning j.*
  ) select c.id,c.business_id,c.conversation_id,c.latest_message_id,c.processing_generation,c.attempts from claimed c;
end;
$$;
revoke all on function public.dabbir_ai_claim_action_jobs(integer) from public,anon,authenticated;
grant execute on function public.dabbir_ai_claim_action_jobs(integer) to service_role;

create or replace function public.dabbir_ai_finish_action_job(p_job_id uuid,p_processing_generation bigint,p_action_type text,p_action_payload jsonb default '{}'::jsonb,p_action_result jsonb default '{}'::jsonb,p_handoff boolean default false)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_job public.dabbir_ai_action_jobs%rowtype; v_state text;
begin
  select * into v_job from public.dabbir_ai_action_jobs where id=p_job_id for update;
  if not found then raise exception 'AI_ACTION_JOB_NOT_FOUND'; end if;
  if v_job.processing_generation is distinct from p_processing_generation or v_job.generation<>p_processing_generation then
    update public.dabbir_ai_action_jobs set state='QUEUED',processing_generation=null,available_at=greatest(available_at,now()+interval '300 milliseconds'),lease_expires_at=null,action_type=null,action_payload='{}'::jsonb,action_result='{}'::jsonb,updated_at=now() where id=p_job_id;
    return 'STALE_REQUEUED';
  end if;
  v_state:=case when coalesce(p_handoff,false) then 'HANDOFF' else 'COMPLETED' end;
  update public.dabbir_ai_action_jobs set state=v_state,processing_generation=null,lease_expires_at=null,action_type=left(nullif(trim(coalesce(p_action_type,'')),''),80),action_payload=coalesce(p_action_payload,'{}'::jsonb),action_result=coalesce(p_action_result,'{}'::jsonb),last_error=null,completed_at=now(),updated_at=now() where id=p_job_id;
  return v_state;
end;
$$;
revoke all on function public.dabbir_ai_finish_action_job(uuid,bigint,text,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.dabbir_ai_finish_action_job(uuid,bigint,text,jsonb,jsonb,boolean) to service_role;

create or replace function public.dabbir_ai_fail_action_job(p_job_id uuid,p_processing_generation bigint,p_error text)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_job public.dabbir_ai_action_jobs%rowtype; v_state text;
begin
  select * into v_job from public.dabbir_ai_action_jobs where id=p_job_id for update;
  if not found then raise exception 'AI_ACTION_JOB_NOT_FOUND'; end if;
  if v_job.generation<>p_processing_generation then
    update public.dabbir_ai_action_jobs set state='QUEUED',processing_generation=null,lease_expires_at=null,available_at=greatest(available_at,now()+interval '300 milliseconds'),last_error=left(coalesce(p_error,'STALE_JOB'),300),updated_at=now() where id=p_job_id;
    return 'STALE_REQUEUED';
  end if;
  v_state:=case when v_job.attempts>=5 then 'FAILED' else 'QUEUED' end;
  update public.dabbir_ai_action_jobs set state=v_state,processing_generation=null,lease_expires_at=null,available_at=case when v_state='QUEUED' then now()+make_interval(secs=>least(60,greatest(2,v_job.attempts*3))) else available_at end,last_error=left(coalesce(p_error,'AI_ACTION_JOB_FAILED'),300),updated_at=now() where id=p_job_id;
  return v_state;
end;
$$;
revoke all on function public.dabbir_ai_fail_action_job(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.dabbir_ai_fail_action_job(uuid,bigint,text) to service_role;

create or replace function public.dabbir_ai_job_generation_current(p_job_id uuid,p_processing_generation bigint)
returns boolean language sql stable security invoker set search_path=pg_catalog,public as $$
  select exists(select 1 from public.dabbir_ai_action_jobs j where j.id=p_job_id and j.state='PROCESSING' and j.generation=p_processing_generation and j.processing_generation=p_processing_generation and j.lease_expires_at>now());
$$;
revoke all on function public.dabbir_ai_job_generation_current(uuid,bigint) from public,anon,authenticated;
grant execute on function public.dabbir_ai_job_generation_current(uuid,bigint) to service_role;

create or replace function public.dabbir_ai_job_context(p_job_id uuid)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare v_job public.dabbir_ai_action_jobs%rowtype; v_business public.dabbir_businesses%rowtype; v_conversation public.dabbir_conversations%rowtype; v_result jsonb;
begin
  select * into v_job from public.dabbir_ai_action_jobs where id=p_job_id;
  if not found then raise exception 'AI_ACTION_JOB_NOT_FOUND'; end if;
  select * into v_business from public.dabbir_businesses where id=v_job.business_id;
  select * into v_conversation from public.dabbir_conversations where business_id=v_job.business_id and id=v_job.conversation_id;
  if not found then raise exception 'AI_ACTION_CONVERSATION_NOT_FOUND'; end if;
  select jsonb_build_object(
    'job',jsonb_build_object('id',v_job.id,'generation',v_job.processing_generation,'attempts',v_job.attempts),
    'business',jsonb_build_object('id',v_business.id,'name',v_business.name,'type',v_business.business_type,'locale',v_business.locale,'country_code',v_business.country_code,'currency_code',v_business.currency_code,'timezone',v_business.timezone,'current_local_time',to_char(now() at time zone coalesce(v_business.timezone,'Asia/Dubai'),'YYYY-MM-DD"T"HH24:MI:SS')),
    'conversation',jsonb_build_object('id',v_conversation.id,'state',v_conversation.state,'channel',v_conversation.channel_type,'customer_id',v_conversation.customer_id),
    'customer',coalesce((select jsonb_build_object('id',c.id,'name',c.display_name,'phone',coalesce(c.phone_e164,c.channel_handle),'lead_status',c.lead_status) from public.dabbir_customers c where c.business_id=v_job.business_id and c.id=v_conversation.customer_id),'{}'::jsonb),
    'messages',coalesce((select jsonb_agg(jsonb_build_object('sender',x.sender_type,'body',x.body,'intent',x.intent,'created_at',x.created_at) order by x.created_at asc) from (select m.sender_type,m.body,m.intent,m.created_at from public.dabbir_messages m where m.business_id=v_job.business_id and m.conversation_id=v_job.conversation_id and m.simulated=false order by m.created_at desc limit 14) x),'[]'::jsonb),
    'services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'name_ar',s.name_ar,'name_en',s.name_en,'duration_minutes',s.duration_minutes,'price',s.price_aed,'category',s.category) order by coalesce(s.name_ar,s.name,s.name_en)) from public.dabbir_services s where s.business_id=v_job.business_id and s.active=true),'[]'::jsonb),
    'workers',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'name',w.display_name,'job_title',w.job_title) order by w.display_name) from public.dabbir_workers w where w.business_id=v_job.business_id and w.status='active'),'[]'::jsonb),
    'products',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'sku',p.sku,'price',p.price_aed,'inventory_verified',(i.product_id is not null),'available',case when i.product_id is null then null else greatest(0,i.quantity-i.reserved) end) order by p.name) from public.dabbir_products p left join public.dabbir_inventory i on i.business_id=p.business_id and i.product_id=p.id where p.business_id=v_job.business_id and p.active=true),'[]'::jsonb),
    'runtime',coalesce((select jsonb_build_object('current_intent',r.current_intent,'pending_action',r.pending_action,'offered_slots',r.offered_slots,'last_action_result',r.last_action_result,'updated_at',r.updated_at) from public.dabbir_conversation_runtime_state r where r.business_id=v_job.business_id and r.conversation_id=v_job.conversation_id),'{}'::jsonb),
    'human_handoff_active',exists(select 1 from public.dabbir_handoffs h where h.business_id=v_job.business_id and h.conversation_id=v_job.conversation_id and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE'))
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.dabbir_ai_job_context(uuid) from public,anon,authenticated;
grant execute on function public.dabbir_ai_job_context(uuid) to service_role;

create or replace function public.dabbir_action_set_runtime_state(p_business_id uuid,p_conversation_id uuid,p_current_intent text default null,p_pending_action jsonb default '{}'::jsonb,p_offered_slots jsonb default '[]'::jsonb,p_last_action_result jsonb default '{}'::jsonb)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if not exists(select 1 from public.dabbir_conversations c where c.business_id=p_business_id and c.id=p_conversation_id and c.demo_mode=false) then raise exception 'AI_ACTION_CONVERSATION_NOT_FOUND'; end if;
  insert into public.dabbir_conversation_runtime_state(business_id,conversation_id,current_intent,pending_action,offered_slots,last_action_result,updated_at)
  values(p_business_id,p_conversation_id,left(nullif(trim(coalesce(p_current_intent,'')),''),120),coalesce(p_pending_action,'{}'::jsonb),case when jsonb_typeof(coalesce(p_offered_slots,'[]'::jsonb))='array' then coalesce(p_offered_slots,'[]'::jsonb) else '[]'::jsonb end,coalesce(p_last_action_result,'{}'::jsonb),now())
  on conflict (business_id,conversation_id) do update set current_intent=excluded.current_intent,pending_action=excluded.pending_action,offered_slots=excluded.offered_slots,last_action_result=excluded.last_action_result,updated_at=now();
  return true;
end;
$$;
revoke all on function public.dabbir_action_set_runtime_state(uuid,uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.dabbir_action_set_runtime_state(uuid,uuid,text,jsonb,jsonb,jsonb) to service_role;

create or replace function dabbir_private.ai_slot_available(p_business_id uuid,p_worker_id uuid,p_starts_at timestamptz,p_ends_at timestamptz)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_timezone text:='Asia/Dubai'; v_local_start timestamp; v_local_end timestamp; v_weekday smallint; v_has_work_schedule boolean:=false;
begin
  if p_business_id is null or p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at or p_starts_at<=now() then return false; end if;
  select coalesce(b.timezone,'Asia/Dubai') into v_timezone from public.dabbir_businesses b where b.id=p_business_id;
  v_local_start:=p_starts_at at time zone v_timezone; v_local_end:=p_ends_at at time zone v_timezone; v_weekday:=extract(dow from v_local_start)::smallint;
  if exists(select 1 from public.dabbir_calendar_busy_blocks b where b.business_id=p_business_id and b.starts_at<p_ends_at and b.ends_at>p_starts_at) then return false; end if;
  if p_worker_id is null then
    if exists(select 1 from public.dabbir_appointments a where a.business_id=p_business_id and a.worker_id is null and a.starts_at is not null and a.status not in ('cancelled','completed','no_show') and a.starts_at<p_ends_at and coalesce(a.ends_at,a.starts_at+interval '60 minutes')>p_starts_at) then return false; end if;
    return true;
  end if;
  if not exists(select 1 from public.dabbir_workers w where w.business_id=p_business_id and w.id=p_worker_id and w.status='active') then return false; end if;
  select exists(select 1 from public.dabbir_worker_schedules s where s.business_id=p_business_id and s.worker_id=p_worker_id and s.active and s.schedule_type='work') into v_has_work_schedule;
  if v_has_work_schedule and not exists(select 1 from public.dabbir_worker_schedules s where s.business_id=p_business_id and s.worker_id=p_worker_id and s.weekday=v_weekday and s.active and s.schedule_type='work' and s.starts_at<=v_local_start::time and s.ends_at>=v_local_end::time) then return false; end if;
  if exists(select 1 from public.dabbir_worker_schedules s where s.business_id=p_business_id and s.worker_id=p_worker_id and s.weekday=v_weekday and s.active and s.schedule_type in ('break','unavailable') and s.starts_at<v_local_end::time and s.ends_at>v_local_start::time) then return false; end if;
  if exists(select 1 from public.dabbir_worker_time_off t where t.business_id=p_business_id and t.worker_id=p_worker_id and t.starts_at<p_ends_at and t.ends_at>p_starts_at) then return false; end if;
  if exists(select 1 from public.dabbir_appointments a where a.business_id=p_business_id and a.worker_id=p_worker_id and a.starts_at is not null and a.status not in ('cancelled','completed','no_show') and a.starts_at<p_ends_at and coalesce(a.ends_at,a.starts_at+interval '60 minutes')>p_starts_at) then return false; end if;
  return true;
end;
$$;
revoke all on function dabbir_private.ai_slot_available(uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated;

create or replace function public.dabbir_action_check_availability(p_business_id uuid,p_conversation_id uuid,p_service_name text default null,p_worker_name text default null,p_requested_local timestamp default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,dabbir_private as $$
declare v_business public.dabbir_businesses%rowtype; v_conversation public.dabbir_conversations%rowtype; v_service public.dabbir_services%rowtype; v_worker public.dabbir_workers%rowtype; v_duration integer:=60; v_price numeric:=0; v_local timestamp; v_start timestamptz; v_end timestamptz; v_slots jsonb:='[]'::jsonb; v_service_count integer:=0; v_worker_count integer:=0; i integer;
begin
  select * into v_business from public.dabbir_businesses where id=p_business_id; if not found then raise exception 'BUSINESS_NOT_FOUND'; end if;
  select * into v_conversation from public.dabbir_conversations where business_id=p_business_id and id=p_conversation_id and demo_mode=false; if not found then raise exception 'AI_ACTION_CONVERSATION_NOT_FOUND'; end if;
  if exists(select 1 from public.dabbir_handoffs h where h.business_id=p_business_id and h.conversation_id=p_conversation_id and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')) then raise exception 'AI_REPLY_BLOCKED_BY_HANDOFF_STATE'; end if;
  select count(*) into v_service_count from public.dabbir_services s where s.business_id=p_business_id and s.active=true;
  if nullif(trim(coalesce(p_service_name,'')),'') is not null then
    select * into v_service from public.dabbir_services s where s.business_id=p_business_id and s.active=true and (lower(trim(coalesce(s.name,'')))=lower(trim(p_service_name)) or lower(trim(coalesce(s.name_ar,'')))=lower(trim(p_service_name)) or lower(trim(coalesce(s.name_en,'')))=lower(trim(p_service_name))) order by s.updated_at desc nulls last limit 1;
    if not found then return jsonb_build_object('ok',false,'state','NEED_SERVICE','services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',coalesce(s.name_ar,s.name,s.name_en)) order by coalesce(s.name_ar,s.name,s.name_en)) from public.dabbir_services s where s.business_id=p_business_id and s.active=true),'[]'::jsonb)); end if;
  elsif v_service_count=1 then select * into v_service from public.dabbir_services s where s.business_id=p_business_id and s.active=true limit 1; end if;
  if v_service.id is not null then v_duration:=greatest(5,coalesce(v_service.duration_minutes,60)); v_price:=greatest(0,coalesce(v_service.price_aed,0)); end if;
  if nullif(trim(coalesce(p_worker_name,'')),'') is not null then
    select * into v_worker from public.dabbir_workers w where w.business_id=p_business_id and w.status='active' and lower(trim(w.display_name))=lower(trim(p_worker_name)) limit 1;
    if not found then return jsonb_build_object('ok',false,'state','NEED_WORKER','workers',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'name',w.display_name) order by w.display_name) from public.dabbir_workers w where w.business_id=p_business_id and w.status='active'),'[]'::jsonb)); end if;
  end if;
  if p_requested_local is null then return jsonb_build_object('ok',false,'state','NEED_TIME','timezone',coalesce(v_business.timezone,'Asia/Dubai')); end if;
  for i in 0..10 loop
    v_local:=p_requested_local+make_interval(mins=>i*30); v_start:=v_local at time zone coalesce(v_business.timezone,'Asia/Dubai'); v_end:=v_start+make_interval(mins=>v_duration);
    if v_worker.id is not null then
      if dabbir_private.ai_slot_available(p_business_id,v_worker.id,v_start,v_end) then v_slots:=v_slots||jsonb_build_array(jsonb_build_object('starts_at',v_start,'local_start',to_char(v_local,'YYYY-MM-DD"T"HH24:MI:SS'),'worker_id',v_worker.id,'worker_name',v_worker.display_name,'service_id',v_service.id,'service_name',coalesce(v_service.name_ar,v_service.name,v_service.name_en),'duration_minutes',v_duration,'price',v_price,'currency_code',coalesce(v_business.currency_code,'AED'),'timezone',coalesce(v_business.timezone,'Asia/Dubai'))); end if;
    else
      select count(*) into v_worker_count from public.dabbir_workers w where w.business_id=p_business_id and w.status='active' and (v_service.id is null or not exists(select 1 from public.dabbir_worker_services any_ws where any_ws.business_id=p_business_id and any_ws.service_id=v_service.id and any_ws.active) or exists(select 1 from public.dabbir_worker_services ws where ws.business_id=p_business_id and ws.worker_id=w.id and ws.service_id=v_service.id and ws.active)) and dabbir_private.ai_slot_available(p_business_id,w.id,v_start,v_end);
      if v_worker_count>0 then
        select w.* into v_worker from public.dabbir_workers w where w.business_id=p_business_id and w.status='active' and (v_service.id is null or not exists(select 1 from public.dabbir_worker_services any_ws where any_ws.business_id=p_business_id and any_ws.service_id=v_service.id and any_ws.active) or exists(select 1 from public.dabbir_worker_services ws where ws.business_id=p_business_id and ws.worker_id=w.id and ws.service_id=v_service.id and ws.active)) and dabbir_private.ai_slot_available(p_business_id,w.id,v_start,v_end) order by w.display_name limit 1;
        v_slots:=v_slots||jsonb_build_array(jsonb_build_object('starts_at',v_start,'local_start',to_char(v_local,'YYYY-MM-DD"T"HH24:MI:SS'),'worker_id',v_worker.id,'worker_name',v_worker.display_name,'service_id',v_service.id,'service_name',coalesce(v_service.name_ar,v_service.name,v_service.name_en),'duration_minutes',v_duration,'price',v_price,'currency_code',coalesce(v_business.currency_code,'AED'),'timezone',coalesce(v_business.timezone,'Asia/Dubai'))); v_worker.id:=null;
      elsif not exists(select 1 from public.dabbir_workers w where w.business_id=p_business_id and w.status='active') and dabbir_private.ai_slot_available(p_business_id,null,v_start,v_end) then
        v_slots:=v_slots||jsonb_build_array(jsonb_build_object('starts_at',v_start,'local_start',to_char(v_local,'YYYY-MM-DD"T"HH24:MI:SS'),'worker_id',null,'worker_name',null,'service_id',v_service.id,'service_name',coalesce(v_service.name_ar,v_service.name,v_service.name_en),'duration_minutes',v_duration,'price',v_price,'currency_code',coalesce(v_business.currency_code,'AED'),'timezone',coalesce(v_business.timezone,'Asia/Dubai')));
      end if;
    end if;
    exit when jsonb_array_length(v_slots)>=3;
  end loop;
  return jsonb_build_object('ok',true,'state',case when jsonb_array_length(v_slots)>0 then 'SLOTS_AVAILABLE' else 'NO_SLOTS' end,'slots',v_slots,'service_id',v_service.id,'service_name',coalesce(v_service.name_ar,v_service.name,v_service.name_en),'timezone',coalesce(v_business.timezone,'Asia/Dubai'),'currency_code',coalesce(v_business.currency_code,'AED'));
end;
$$;
revoke all on function public.dabbir_action_check_availability(uuid,uuid,text,text,timestamp) from public,anon,authenticated;
grant execute on function public.dabbir_action_check_availability(uuid,uuid,text,text,timestamp) to service_role;

create or replace function public.dabbir_action_create_booking(p_business_id uuid,p_conversation_id uuid,p_service_id uuid default null,p_worker_id uuid default null,p_starts_at timestamptz default null,p_notes text default '')
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,dabbir_private as $$
declare v_business public.dabbir_businesses%rowtype; v_conversation public.dabbir_conversations%rowtype; v_service public.dabbir_services%rowtype; v_worker_id uuid:=p_worker_id; v_duration integer:=60; v_price numeric:=0; v_start timestamptz:=p_starts_at; v_end timestamptz; v_appointment_id uuid; v_worker_name text;
begin
  if v_start is null or v_start<=now() then raise exception 'ACTION_VALID_FUTURE_TIME_REQUIRED'; end if;
  select * into v_business from public.dabbir_businesses where id=p_business_id; if not found then raise exception 'BUSINESS_NOT_FOUND'; end if;
  select * into v_conversation from public.dabbir_conversations c where c.business_id=p_business_id and c.id=p_conversation_id and c.channel_type in ('whatsapp','web') and c.demo_mode=false and c.state<>'closed' for update; if not found then raise exception 'AI_ACTION_CONVERSATION_NOT_FOUND'; end if;
  if exists(select 1 from public.dabbir_handoffs h where h.business_id=p_business_id and h.conversation_id=p_conversation_id and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')) then raise exception 'AI_REPLY_BLOCKED_BY_HANDOFF_STATE'; end if;
  if p_service_id is not null then select * into v_service from public.dabbir_services s where s.business_id=p_business_id and s.id=p_service_id and s.active=true; if not found then raise exception 'ACTION_SERVICE_NOT_AVAILABLE'; end if; v_duration:=greatest(5,coalesce(v_service.duration_minutes,60)); v_price:=greatest(0,coalesce(v_service.price_aed,0)); end if;
  if v_worker_id is not null then
    if not exists(select 1 from public.dabbir_workers w where w.business_id=p_business_id and w.id=v_worker_id and w.status='active') then raise exception 'ACTION_WORKER_NOT_AVAILABLE'; end if;
    if p_service_id is not null and exists(select 1 from public.dabbir_worker_services any_ws where any_ws.business_id=p_business_id and any_ws.service_id=p_service_id and any_ws.active) and not exists(select 1 from public.dabbir_worker_services ws where ws.business_id=p_business_id and ws.worker_id=v_worker_id and ws.service_id=p_service_id and ws.active) then raise exception 'ACTION_WORKER_SERVICE_MISMATCH'; end if;
  elsif exists(select 1 from public.dabbir_workers w where w.business_id=p_business_id and w.status='active') then
    v_end:=v_start+make_interval(mins=>v_duration);
    select w.id into v_worker_id from public.dabbir_workers w where w.business_id=p_business_id and w.status='active' and (p_service_id is null or not exists(select 1 from public.dabbir_worker_services any_ws where any_ws.business_id=p_business_id and any_ws.service_id=p_service_id and any_ws.active) or exists(select 1 from public.dabbir_worker_services ws where ws.business_id=p_business_id and ws.worker_id=w.id and ws.service_id=p_service_id and ws.active)) and dabbir_private.ai_slot_available(p_business_id,w.id,v_start,v_end) order by w.display_name limit 1;
    if v_worker_id is null then raise exception 'ACTION_SLOT_UNAVAILABLE'; end if;
  end if;
  if p_service_id is not null and v_worker_id is not null then
    select coalesce(ws.duration_minutes,v_duration),coalesce(ws.price_aed,v_price) into v_duration,v_price from public.dabbir_worker_services ws where ws.business_id=p_business_id and ws.worker_id=v_worker_id and ws.service_id=p_service_id and ws.active limit 1;
    v_duration:=coalesce(v_duration,coalesce(v_service.duration_minutes,60)); v_price:=coalesce(v_price,coalesce(v_service.price_aed,0));
  end if;
  v_end:=v_start+make_interval(mins=>greatest(5,v_duration)); if not dabbir_private.ai_slot_available(p_business_id,v_worker_id,v_start,v_end) then raise exception 'ACTION_SLOT_UNAVAILABLE'; end if;
  insert into public.dabbir_appointments(business_id,customer_id,service_id,worker_id,starts_at,ends_at,status,simulated,quoted_price_aed,discount_aed,notes,booking_source,payment_status,confirmation_gate,owner_approval_status)
  values(p_business_id,v_conversation.customer_id,p_service_id,v_worker_id,v_start,v_end,'confirmed',false,v_price,0,left(coalesce(p_notes,''),2000),v_conversation.channel_type,'unpaid','none','not_required') returning id into v_appointment_id;
  select w.display_name into v_worker_name from public.dabbir_workers w where w.business_id=p_business_id and w.id=v_worker_id;
  insert into public.dabbir_conversation_runtime_state(business_id,conversation_id,current_intent,pending_action,offered_slots,last_action_result,updated_at)
  values(p_business_id,p_conversation_id,'BOOKING','{}'::jsonb,'[]'::jsonb,jsonb_build_object('action','CREATE_BOOKING','verified',true,'appointment_id',v_appointment_id,'service_id',p_service_id,'service_name',coalesce(v_service.name_ar,v_service.name,v_service.name_en),'worker_id',v_worker_id,'worker_name',v_worker_name,'starts_at',v_start,'ends_at',v_end,'price',v_price,'currency_code',coalesce(v_business.currency_code,'AED')),now())
  on conflict (business_id,conversation_id) do update set current_intent='BOOKING',pending_action='{}'::jsonb,offered_slots='[]'::jsonb,last_action_result=excluded.last_action_result,updated_at=now();
  return jsonb_build_object('ok',true,'state','BOOKING_CREATED','verified',true,'appointment_id',v_appointment_id,'service_id',p_service_id,'service_name',coalesce(v_service.name_ar,v_service.name,v_service.name_en),'worker_id',v_worker_id,'worker_name',v_worker_name,'starts_at',v_start,'ends_at',v_end,'price',v_price,'currency_code',coalesce(v_business.currency_code,'AED'),'timezone',coalesce(v_business.timezone,'Asia/Dubai'));
end;
$$;
revoke all on function public.dabbir_action_create_booking(uuid,uuid,uuid,uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.dabbir_action_create_booking(uuid,uuid,uuid,uuid,timestamptz,text) to service_role;

create or replace function public.dabbir_action_create_handoff(p_business_id uuid,p_conversation_id uuid,p_route_class text default 'SUPPORT',p_reason text default 'Customer requested human assistance',p_summary text default '')
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_conversation public.dabbir_conversations%rowtype; v_handoff_id uuid; v_route text:=upper(trim(coalesce(p_route_class,'SUPPORT')));
begin
  if v_route not in ('SALES','SUPPORT','BOOKING','RETURNS','COMPLAINT','OWNER_DECISION') then v_route:='SUPPORT'; end if;
  select * into v_conversation from public.dabbir_conversations c where c.business_id=p_business_id and c.id=p_conversation_id and c.demo_mode=false and c.state<>'closed' for update; if not found then raise exception 'AI_ACTION_CONVERSATION_NOT_FOUND'; end if;
  select h.id into v_handoff_id from public.dabbir_handoffs h where h.business_id=p_business_id and h.conversation_id=p_conversation_id and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE') order by h.created_at desc limit 1 for update;
  if v_handoff_id is null then insert into public.dabbir_handoffs(business_id,conversation_id,customer_id,route_class,reason,state,priority,routing_strategy,summary,attempted_actions,unresolved_items,metadata) values(p_business_id,p_conversation_id,v_conversation.customer_id,v_route,left(coalesce(p_reason,'Customer requested human assistance'),500),'QUEUED',70,'least_open',left(coalesce(p_summary,''),1200),'[]'::jsonb,'[]'::jsonb,jsonb_build_object('source','dabbir_ai_action','customer_requested_human',true)) returning id into v_handoff_id; end if;
  update public.dabbir_conversations set state='action_required',updated_at=now() where business_id=p_business_id and id=p_conversation_id;
  insert into public.dabbir_conversation_runtime_state(business_id,conversation_id,current_intent,pending_action,offered_slots,last_action_result,updated_at) values(p_business_id,p_conversation_id,'HANDOFF','{}'::jsonb,'[]'::jsonb,jsonb_build_object('action','HANDOFF','verified',true,'handoff_id',v_handoff_id,'state','QUEUED'),now()) on conflict (business_id,conversation_id) do update set current_intent='HANDOFF',pending_action='{}'::jsonb,offered_slots='[]'::jsonb,last_action_result=excluded.last_action_result,updated_at=now();
  return jsonb_build_object('ok',true,'state','HANDOFF_QUEUED','verified',true,'handoff_id',v_handoff_id);
end;
$$;
revoke all on function public.dabbir_action_create_handoff(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_action_create_handoff(uuid,uuid,text,text,text) to service_role;

create or replace function public.dabbir_whatsapp_reserve_ai_outbound(p_business_id uuid,p_conversation_id uuid,p_idempotency_key text,p_payload_hash text,p_body text)
returns table(reservation_id uuid,should_send boolean,reservation_state text,connection_id uuid,phone_number_id text,recipient_handle text,provider_message_id text,message_id uuid)
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_connection public.dabbir_whatsapp_connections%rowtype; v_conversation public.dabbir_conversations%rowtype; v_existing public.dabbir_whatsapp_outbound_reservations%rowtype; v_recipient text; v_key text:=trim(coalesce(p_idempotency_key,'')); v_hash text:=lower(trim(coalesce(p_payload_hash,'')));
begin
  if p_business_id is null or p_conversation_id is null then raise exception 'WHATSAPP_AI_OUTBOUND_CONTEXT_REQUIRED'; end if; if length(v_key) not between 16 and 160 then raise exception 'WHATSAPP_IDEMPOTENCY_KEY_REQUIRED'; end if; if v_hash !~ '^[0-9a-f]{64}$' then raise exception 'WHATSAPP_PAYLOAD_HASH_REQUIRED'; end if; if nullif(trim(p_body),'') is null or length(p_body)>4000 then raise exception 'WHATSAPP_MESSAGE_BODY_REQUIRED'; end if;
  select * into v_connection from public.dabbir_whatsapp_connections c where c.business_id=p_business_id and c.status='connected' limit 1; if not found then raise exception 'WHATSAPP_TENANT_CONNECTION_NOT_FOUND'; end if;
  select * into v_conversation from public.dabbir_conversations c where c.business_id=p_business_id and c.id=p_conversation_id and c.channel_type='whatsapp' and c.demo_mode=false and c.state<>'closed' limit 1; if not found or v_conversation.customer_id is null then raise exception 'WHATSAPP_CONVERSATION_NOT_FOUND'; end if;
  select nullif(trim(c.channel_handle),'') into v_recipient from public.dabbir_customers c where c.business_id=p_business_id and c.id=v_conversation.customer_id limit 1; if v_recipient is null then raise exception 'WHATSAPP_CUSTOMER_HANDLE_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':wa-ai-out:'||v_key,0)); select * into v_existing from public.dabbir_whatsapp_outbound_reservations r where r.business_id=p_business_id and r.idempotency_key=v_key limit 1;
  if found then if v_existing.conversation_id<>p_conversation_id or v_existing.sender_kind<>'ai' or v_existing.payload_hash<>v_hash then raise exception 'WHATSAPP_IDEMPOTENCY_KEY_REUSED_DIFFERENT_REQUEST'; end if; return query select v_existing.id,false,v_existing.state,v_existing.connection_id,v_connection.phone_number_id,v_existing.recipient_handle,v_existing.provider_message_id,v_existing.message_id; return; end if;
  if exists(select 1 from public.dabbir_handoffs h where h.business_id=p_business_id and h.conversation_id=p_conversation_id and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')) then raise exception 'AI_REPLY_BLOCKED_BY_HANDOFF_STATE'; end if;
  insert into public.dabbir_whatsapp_outbound_reservations(business_id,connection_id,conversation_id,sender_user_id,sender_kind,idempotency_key,payload_hash,recipient_handle,body,state,external_attempt_started_at) values(p_business_id,v_connection.id,p_conversation_id,null,'ai',v_key,v_hash,v_recipient,left(trim(p_body),4000),'SENDING',now()) returning * into v_existing;
  return query select v_existing.id,true,v_existing.state,v_existing.connection_id,v_connection.phone_number_id,v_existing.recipient_handle,null::text,null::uuid;
end;
$$;
revoke all on function public.dabbir_whatsapp_reserve_ai_outbound(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_reserve_ai_outbound(uuid,uuid,text,text,text) to service_role;

create or replace function public.dabbir_whatsapp_finalize_outbound(p_reservation_id uuid,p_provider_message_id text)
returns table(message_id uuid,event_id uuid,reservation_state text,duplicate boolean)
language plpgsql security invoker set search_path=pg_catalog,public,dabbir_private,auth as $$
declare v_res public.dabbir_whatsapp_outbound_reservations%rowtype; v_message_id uuid; v_event_id uuid; v_provider_id text:=trim(coalesce(p_provider_message_id,'')); v_sender_type text;
begin
  if p_reservation_id is null or length(v_provider_id) not between 3 and 320 then raise exception 'WHATSAPP_PROVIDER_MESSAGE_ID_REQUIRED'; end if; select * into v_res from public.dabbir_whatsapp_outbound_reservations where id=p_reservation_id for update; if not found then raise exception 'WHATSAPP_OUTBOUND_RESERVATION_NOT_FOUND'; end if;
  if v_res.state<>'SENDING' then if v_res.provider_message_id=v_provider_id and v_res.message_id is not null then return query select v_res.message_id,(select e.id from public.dabbir_whatsapp_event_ledger e where e.business_id=v_res.business_id and e.event_key='outbound:'||v_provider_id limit 1),v_res.state,true; return; end if; raise exception 'WHATSAPP_OUTBOUND_RESERVATION_NOT_FINALIZABLE'; end if;
  v_sender_type:=case when v_res.sender_kind='ai' then 'ai' else 'human' end;
  insert into public.dabbir_messages(business_id,conversation_id,sender_type,body,intent,simulated,sender_user_id) values(v_res.business_id,v_res.conversation_id,v_sender_type,v_res.body,null,false,case when v_res.sender_kind='human' then v_res.sender_user_id else null end) returning id into v_message_id;
  update public.dabbir_conversations c set state=case when exists(select 1 from public.dabbir_handoffs h where h.business_id=v_res.business_id and h.conversation_id=v_res.conversation_id and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')) then 'action_required' else 'waiting_customer' end,updated_at=now() where c.business_id=v_res.business_id and c.id=v_res.conversation_id;
  insert into public.dabbir_whatsapp_event_ledger(business_id,connection_id,event_key,direction,event_type,provider_message_id,conversation_id,message_id,provider_status,provider_verified,occurred_at,evidence) values(v_res.business_id,v_res.connection_id,'outbound:'||v_provider_id,'outbound','message',v_provider_id,v_res.conversation_id,v_message_id,'accepted',false,now(),jsonb_build_object('source','meta_messages_api','provider_accepted',true,'reservation_id',v_res.id,'sender_kind',v_res.sender_kind)) returning id into v_event_id;
  update public.dabbir_whatsapp_outbound_reservations set state='PROVIDER_ACCEPTED',provider_message_id=v_provider_id,message_id=v_message_id,provider_status='accepted',finalized_at=now(),error_code=null,updated_at=now() where id=v_res.id;
  return query select v_message_id,v_event_id,'PROVIDER_ACCEPTED'::text,false;
end;
$$;
revoke all on function public.dabbir_whatsapp_finalize_outbound(uuid,text) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_finalize_outbound(uuid,text) to service_role;
