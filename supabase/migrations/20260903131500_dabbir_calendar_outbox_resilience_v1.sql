-- DABBIR calendar resilience: business truth commits first; external calendar side effects retry separately.

-- Operational appointments are never hard-deleted by normal authenticated users.
-- Cancellation preserves audit/history and lets the outbox reconcile provider state later.
drop policy if exists dabbir_appointments_delete on public.dabbir_appointments;
revoke delete on public.dabbir_appointments from authenticated;

create table if not exists public.dabbir_integration_outbox (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  destination text not null check (destination in ('calendar_sync')),
  aggregate_type text not null default 'appointment' check (char_length(aggregate_type) between 2 and 60),
  aggregate_id uuid,
  event_type text not null check (char_length(event_type) between 2 and 80),
  idempotency_key text not null check (char_length(idempotency_key) between 12 and 200),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','retry','succeeded','dead','cancelled')),
  attempts integer not null default 0 check (attempts between 0 and 100),
  max_attempts integer not null default 8 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  lock_token uuid,
  provider_correlation_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (business_id,destination,idempotency_key)
);

create index if not exists dabbir_integration_outbox_due_idx
  on public.dabbir_integration_outbox(status,available_at,created_at)
  where status in ('pending','retry');
create index if not exists dabbir_integration_outbox_dead_idx
  on public.dabbir_integration_outbox(updated_at desc,business_id)
  where status='dead';
create index if not exists dabbir_integration_outbox_business_idx
  on public.dabbir_integration_outbox(business_id,destination,created_at desc);

alter table public.dabbir_integration_outbox enable row level security;
revoke all on public.dabbir_integration_outbox from public,anon,authenticated;
grant select,insert,update,delete on public.dabbir_integration_outbox to service_role;

create or replace function dabbir_private.enqueue_calendar_sync_from_appointment()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_event text;
  v_key text;
begin
  if tg_op='UPDATE' and row(new.starts_at,new.ends_at,new.status,new.worker_id,new.customer_id,new.service_id)
     is not distinct from row(old.starts_at,old.ends_at,old.status,old.worker_id,old.customer_id,old.service_id) then
    return new;
  end if;

  if not exists(
    select 1 from public.dabbir_calendar_connections c
    where c.business_id=new.business_id
      and c.status in ('active','error')
      and c.sync_enabled=true
  ) then return new; end if;

  v_event := case when new.status='cancelled' then 'appointment.cancelled' else 'appointment.upserted' end;
  -- Transaction id makes every committed appointment mutation independently recoverable.
  -- Multiple mutations inside one transaction coalesce into the final state.
  v_key := 'appointment:'||new.id||':'||txid_current()::text;

  insert into public.dabbir_integration_outbox(
    business_id,destination,aggregate_type,aggregate_id,event_type,idempotency_key,payload
  ) values(
    new.business_id,'calendar_sync','appointment',new.id,v_event,v_key,
    jsonb_build_object(
      'appointment_id',new.id,'status',new.status,'starts_at',new.starts_at,'ends_at',new.ends_at,
      'worker_id',new.worker_id,'customer_id',new.customer_id,'service_id',new.service_id
    )
  ) on conflict (business_id,destination,idempotency_key) do update
    set event_type=excluded.event_type,payload=excluded.payload,updated_at=now();
  return new;
end;
$$;
revoke all on function dabbir_private.enqueue_calendar_sync_from_appointment() from public,anon,authenticated;

drop trigger if exists zz_dabbir_appointment_calendar_outbox on public.dabbir_appointments;
create trigger zz_dabbir_appointment_calendar_outbox
after insert or update on public.dabbir_appointments
for each row execute function dabbir_private.enqueue_calendar_sync_from_appointment();

create or replace function public.dabbir_claim_integration_jobs(p_limit integer default 20)
returns table(
  job_id uuid,business_id uuid,destination text,aggregate_type text,aggregate_id uuid,
  event_type text,payload jsonb,attempts integer,max_attempts integer,lock_token uuid
)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  -- Calendar writes are provider-idempotent. A worker that disappears can therefore
  -- be retried safely after its lease expires.
  update public.dabbir_integration_outbox o
  set status=case when o.attempts>=o.max_attempts then 'dead' else 'retry' end,
      available_at=case when o.attempts>=o.max_attempts then o.available_at else now() end,
      last_error=case when o.attempts>=o.max_attempts then 'STALE_PROCESSING_EXHAUSTED' else 'STALE_PROCESSING_RECOVERED' end,
      locked_at=null,lock_token=null,updated_at=now(),
      completed_at=case when o.attempts>=o.max_attempts then now() else null end
  where o.status='processing' and o.locked_at<now()-interval '5 minutes';

  return query
  with candidates as (
    select o.id
    from public.dabbir_integration_outbox o
    where o.status in ('pending','retry') and o.available_at<=now()
    order by o.available_at,o.created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,20),100))
  ), claimed as (
    update public.dabbir_integration_outbox o
    set status='processing',attempts=o.attempts+1,locked_at=now(),lock_token=gen_random_uuid(),updated_at=now()
    from candidates c where o.id=c.id
    returning o.*
  )
  select c.id,c.business_id,c.destination,c.aggregate_type,c.aggregate_id,c.event_type,
         c.payload,c.attempts,c.max_attempts,c.lock_token
  from claimed c order by c.available_at,c.created_at;
end;
$$;
revoke all on function public.dabbir_claim_integration_jobs(integer) from public,anon,authenticated;
grant execute on function public.dabbir_claim_integration_jobs(integer) to service_role;

create or replace function public.dabbir_finalize_integration_job(
  p_job_id uuid,p_lock_token uuid,p_success boolean,p_retryable boolean,
  p_error text default null,p_provider_correlation_id text default null
) returns text
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_job public.dabbir_integration_outbox%rowtype;
  v_state text;
  v_delay integer;
begin
  select o.* into v_job from public.dabbir_integration_outbox o
  where o.id=p_job_id and o.status='processing' and o.lock_token=p_lock_token for update;
  if not found then return 'not_owned'; end if;

  if p_success then
    v_state:='succeeded';
    update public.dabbir_integration_outbox o
    set status=v_state,completed_at=now(),locked_at=null,lock_token=null,
        provider_correlation_id=left(nullif(p_provider_correlation_id,''),320),last_error=null,updated_at=now()
    where o.id=p_job_id;
  elsif coalesce(p_retryable,false) and v_job.attempts<v_job.max_attempts then
    v_state:='retry';
    v_delay:=least(1800,30*power(2,greatest(0,v_job.attempts-1))::integer);
    update public.dabbir_integration_outbox o
    set status=v_state,available_at=now()+make_interval(secs=>v_delay),
        locked_at=null,lock_token=null,last_error=left(nullif(p_error,''),500),updated_at=now()
    where o.id=p_job_id;
  else
    v_state:='dead';
    update public.dabbir_integration_outbox o
    set status=v_state,completed_at=now(),locked_at=null,lock_token=null,
        last_error=left(nullif(p_error,''),500),updated_at=now()
    where o.id=p_job_id;
  end if;
  return v_state;
end;
$$;
revoke all on function public.dabbir_finalize_integration_job(uuid,uuid,boolean,boolean,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_finalize_integration_job(uuid,uuid,boolean,boolean,text,text) to service_role;

create or replace function public.dabbir_cleanup_calendar_outbox()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_deleted integer:=0;
begin
  delete from public.dabbir_integration_outbox
  where status in ('succeeded','cancelled') and completed_at<now()-interval '30 days';
  get diagnostics v_deleted=row_count;
  return jsonb_build_object('deleted',v_deleted);
end;
$$;
revoke all on function public.dabbir_cleanup_calendar_outbox() from public,anon,authenticated;
grant execute on function public.dabbir_cleanup_calendar_outbox() to service_role;
