-- DABBIR Owner Away Mode v1
-- Owner-first operational mode: changes escalation visibility without granting new financial/legal authority.

create schema if not exists dabbir_private;
revoke all on schema dabbir_private from public, anon;
grant usage on schema dabbir_private to authenticated, service_role;

create table if not exists public.dabbir_owner_modes (
  business_id uuid primary key references public.dabbir_businesses(id) on delete cascade,
  enabled boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text not null default 'Asia/Dubai',
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dabbir_owner_modes_window_check check (
    (enabled=false) or (starts_at is not null and ends_at is not null and ends_at>starts_at)
  ),
  constraint dabbir_owner_modes_timezone_check check (length(timezone) between 1 and 64)
);

alter table public.dabbir_owner_modes enable row level security;
alter table public.dabbir_owner_modes force row level security;
revoke all on public.dabbir_owner_modes from anon;
revoke truncate, references, trigger, delete on public.dabbir_owner_modes from authenticated;
grant select, insert, update on public.dabbir_owner_modes to authenticated;

drop policy if exists dabbir_owner_modes_select on public.dabbir_owner_modes;
drop policy if exists dabbir_owner_modes_owner_insert on public.dabbir_owner_modes;
drop policy if exists dabbir_owner_modes_owner_update on public.dabbir_owner_modes;

create policy dabbir_owner_modes_select on public.dabbir_owner_modes
for select to authenticated
using (dabbir_private.has_permission(business_id,'view_business'));

create policy dabbir_owner_modes_owner_insert on public.dabbir_owner_modes
for insert to authenticated
with check (
  exists (
    select 1 from public.dabbir_memberships m
    where m.business_id=dabbir_owner_modes.business_id
      and m.user_id=(select auth.uid())
      and m.role='owner'
  )
  and updated_by=(select auth.uid())
);

create policy dabbir_owner_modes_owner_update on public.dabbir_owner_modes
for update to authenticated
using (
  exists (
    select 1 from public.dabbir_memberships m
    where m.business_id=dabbir_owner_modes.business_id
      and m.user_id=(select auth.uid())
      and m.role='owner'
  )
)
with check (
  exists (
    select 1 from public.dabbir_memberships m
    where m.business_id=dabbir_owner_modes.business_id
      and m.user_id=(select auth.uid())
      and m.role='owner'
  )
  and updated_by=(select auth.uid())
);

create table if not exists dabbir_private.owner_mode_events (
  id bigint generated always as identity primary key,
  business_id uuid not null,
  actor_user_id uuid,
  event_type text not null check (event_type in ('CREATED','ACTIVATED','DEACTIVATED','UPDATED')),
  previous_state jsonb,
  next_state jsonb not null,
  occurred_at timestamptz not null default now()
);
create index if not exists dabbir_owner_mode_events_business_time_idx
  on dabbir_private.owner_mode_events(business_id,occurred_at desc);
revoke all on dabbir_private.owner_mode_events from public, anon, authenticated;
grant select, insert on dabbir_private.owner_mode_events to service_role;

create or replace function dabbir_private.audit_owner_mode_change()
returns trigger
language plpgsql
security definer
set search_path=public,dabbir_private,pg_temp
as $$
declare v_event text;
begin
  if tg_op='INSERT' then
    v_event:=case when new.enabled then 'ACTIVATED' else 'CREATED' end;
  elsif old.enabled=false and new.enabled=true then
    v_event:='ACTIVATED';
  elsif old.enabled=true and new.enabled=false then
    v_event:='DEACTIVATED';
  else
    v_event:='UPDATED';
  end if;

  insert into dabbir_private.owner_mode_events(
    business_id,actor_user_id,event_type,previous_state,next_state
  ) values (
    new.business_id,
    (select auth.uid()),
    v_event,
    case when tg_op='UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return new;
end;
$$;
revoke all on function dabbir_private.audit_owner_mode_change() from public, anon, authenticated;

drop trigger if exists dabbir_audit_owner_mode_change on public.dabbir_owner_modes;
create trigger dabbir_audit_owner_mode_change
after insert or update on public.dabbir_owner_modes
for each row execute function dabbir_private.audit_owner_mode_change();

create or replace function public.dabbir_owner_away_mode_events(p_business_id uuid)
returns table(
  event_id bigint,
  event_type text,
  actor_user_id uuid,
  previous_state jsonb,
  next_state jsonb,
  occurred_at timestamptz
)
language plpgsql
security definer
set search_path=public,dabbir_private,pg_temp
as $$
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.dabbir_memberships m
    where m.business_id=p_business_id
      and m.user_id=(select auth.uid())
      and m.role='owner'
  ) then raise exception 'OWNER_REQUIRED'; end if;

  return query
  select e.id,e.event_type,e.actor_user_id,e.previous_state,e.next_state,e.occurred_at
  from dabbir_private.owner_mode_events e
  where e.business_id=p_business_id
  order by e.occurred_at desc
  limit 50;
end;
$$;
revoke all on function public.dabbir_owner_away_mode_events(uuid) from public, anon;
grant execute on function public.dabbir_owner_away_mode_events(uuid) to authenticated, service_role;
