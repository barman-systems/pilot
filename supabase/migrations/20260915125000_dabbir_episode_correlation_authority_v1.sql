-- DABBIR Episode Correlation Authority V1
-- Purpose: carry the existing V3 runtime episode_id from semantic understanding
-- through decision, action, handoff and booking-funnel evidence without creating
-- a second episode detector or a writable outcome claim.

alter table public.dabbir_ai_understanding_events
  add column if not exists episode_id text;
alter table public.dabbir_ai_operator_events
  add column if not exists episode_id text;
alter table public.dabbir_ai_action_ledger
  add column if not exists episode_id text;
alter table public.dabbir_ai_booking_funnel_events
  add column if not exists episode_id text;
alter table public.dabbir_handoffs
  add column if not exists episode_id text;

alter table public.dabbir_ai_understanding_events drop constraint if exists dabbir_ai_understanding_episode_id_check;
alter table public.dabbir_ai_understanding_events add constraint dabbir_ai_understanding_episode_id_check
  check (episode_id is null or char_length(episode_id) between 8 and 220);
alter table public.dabbir_ai_operator_events drop constraint if exists dabbir_ai_operator_episode_id_check;
alter table public.dabbir_ai_operator_events add constraint dabbir_ai_operator_episode_id_check
  check (episode_id is null or char_length(episode_id) between 8 and 220);
alter table public.dabbir_ai_action_ledger drop constraint if exists dabbir_ai_action_episode_id_check;
alter table public.dabbir_ai_action_ledger add constraint dabbir_ai_action_episode_id_check
  check (episode_id is null or char_length(episode_id) between 8 and 220);
alter table public.dabbir_ai_booking_funnel_events drop constraint if exists dabbir_ai_booking_funnel_episode_id_check;
alter table public.dabbir_ai_booking_funnel_events add constraint dabbir_ai_booking_funnel_episode_id_check
  check (episode_id is null or char_length(episode_id) between 8 and 220);
alter table public.dabbir_handoffs drop constraint if exists dabbir_handoffs_episode_id_check;
alter table public.dabbir_handoffs add constraint dabbir_handoffs_episode_id_check
  check (episode_id is null or char_length(episode_id) between 8 and 220);

create index if not exists dabbir_ai_understanding_episode_idx
  on public.dabbir_ai_understanding_events(business_id,conversation_id,episode_id,created_at)
  where episode_id is not null;
create index if not exists dabbir_ai_operator_episode_idx
  on public.dabbir_ai_operator_events(business_id,conversation_id,episode_id,occurred_at)
  where episode_id is not null;
create index if not exists dabbir_ai_action_episode_idx
  on public.dabbir_ai_action_ledger(business_id,conversation_id,episode_id,created_at)
  where episode_id is not null;
create index if not exists dabbir_ai_booking_funnel_episode_idx
  on public.dabbir_ai_booking_funnel_events(business_id,conversation_id,episode_id,occurred_at)
  where episode_id is not null;
create index if not exists dabbir_handoffs_episode_idx
  on public.dabbir_handoffs(business_id,conversation_id,episode_id,created_at)
  where episode_id is not null;

-- Historical V3 epoch: use the durable NEW_EPISODE event UUID as the anchor.
-- This intentionally does not attempt to string-match event timestamps to the
-- native runtime episode_id format. Each epoch only needs internal consistency.
with mapped as (
  select e.id,
    'legacy-v3:'||(
      select a.id::text
      from public.dabbir_ai_understanding_events a
      where a.business_id=e.business_id
        and a.conversation_id=e.conversation_id
        and a.event_type='UNDERSTOOD'
        and a.metrics->>'engine'='V3'
        and a.metrics->>'episode'='NEW_EPISODE'
        and a.created_at<=e.created_at
      order by a.created_at desc,a.id desc
      limit 1
    ) as derived_episode_id
  from public.dabbir_ai_understanding_events e
  where e.metrics->>'engine'='V3'
    and e.episode_id is null
)
update public.dabbir_ai_understanding_events e
set episode_id=m.derived_episode_id
from mapped m
where e.id=m.id and m.derived_episode_id is not null;

-- Decision/operator events can be joined deterministically through their batch.
update public.dabbir_ai_operator_events o
set episode_id=u.episode_id
from public.dabbir_ai_understanding_events u
where o.episode_id is null
  and o.batch_id=u.batch_id
  and u.event_type='UNDERSTOOD'
  and u.episode_id is not null;

-- Historical action rows carry the originating batch UUID inside the existing
-- idempotency key. Only parse the canonical understanding-v2 key shape.
with mapped as (
  select l.id,u.episode_id
  from public.dabbir_ai_action_ledger l
  join public.dabbir_ai_understanding_events u
    on u.batch_id=split_part(l.operation_key,':',2)::uuid
   and u.event_type='UNDERSTOOD'
   and u.episode_id is not null
  where l.episode_id is null
    and l.operation_key ~ '^understanding-v2:[0-9a-fA-F-]{36}:'
)
update public.dabbir_ai_action_ledger l
set episode_id=m.episode_id
from mapped m
where l.id=m.id;

-- Existing funnel evidence inherits correlation only from durable source rows.
update public.dabbir_ai_booking_funnel_events f
set episode_id=o.episode_id
from public.dabbir_ai_operator_events o
where f.episode_id is null
  and f.source_kind='decision'
  and f.source_id=o.id
  and o.episode_id is not null;

update public.dabbir_ai_booking_funnel_events f
set episode_id=l.episode_id
from public.dabbir_ai_action_ledger l
where f.episode_id is null
  and f.source_kind='action'
  and f.source_id=l.id
  and l.episode_id is not null;

with mapped as (
  select f.id,
    (
      select l.episode_id
      from public.dabbir_ai_action_ledger l
      where l.business_id=f.business_id
        and l.conversation_id=f.conversation_id
        and l.entity_id=f.appointment_id
        and l.operation_type='booking.create'
        and l.episode_id is not null
      order by l.created_at asc,l.id asc
      limit 1
    ) as episode_id
  from public.dabbir_ai_booking_funnel_events f
  where f.episode_id is null
    and f.source_kind in ('appointment','payment')
    and f.appointment_id is not null
)
update public.dabbir_ai_booking_funnel_events f
set episode_id=m.episode_id
from mapped m
where f.id=m.id and m.episode_id is not null;

-- V3 understanding is not allowed to create another uncorrelated history row.
alter table public.dabbir_ai_understanding_events drop constraint if exists dabbir_ai_understanding_v3_episode_required;
alter table public.dabbir_ai_understanding_events add constraint dabbir_ai_understanding_v3_episode_required
  check (coalesce(metrics->>'engine','')<>'V3' or episode_id is not null);

-- Bind understanding rows from the already-committed canonical V3 state. The
-- semantic commit updates dabbir_ai_conversation_state before inserting its event.
create or replace function dabbir_private.bind_understanding_episode_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_episode text;v_engine text;
begin
  select nullif(s.semantic_state#>>'{v3_runtime,episode_id}',''),
         nullif(s.semantic_state#>>'{v3_engine,engine}','')
    into v_episode,v_engine
  from public.dabbir_ai_conversation_state s
  where s.business_id=new.business_id and s.conversation_id=new.conversation_id;

  if new.episode_id is null then new.episode_id:=v_episode; end if;
  if (coalesce(new.metrics->>'engine','')='V3' or v_engine='V3') and new.episode_id is null then
    raise exception 'V3_EPISODE_ID_REQUIRED';
  end if;
  if coalesce(new.metrics->>'engine','')='V3' and v_episode is not null and new.episode_id is distinct from v_episode then
    raise exception 'V3_EPISODE_ID_MISMATCH';
  end if;
  return new;
end;
$$;
revoke all on function dabbir_private.bind_understanding_episode_v1() from public,anon,authenticated;

drop trigger if exists dabbir_bind_understanding_episode on public.dabbir_ai_understanding_events;
create trigger dabbir_bind_understanding_episode
before insert on public.dabbir_ai_understanding_events
for each row execute function dabbir_private.bind_understanding_episode_v1();

-- Operator evidence binds through the originating batch/source whenever possible.
-- Pre-understanding PROCESSING/RETRY events may legitimately remain unscoped.
create or replace function dabbir_private.bind_operator_episode_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_episode text;v_batch_engine text;
begin
  if new.batch_id is not null then
    select u.episode_id,u.metrics->>'engine'
      into v_episode,v_batch_engine
    from public.dabbir_ai_understanding_events u
    where u.business_id=new.business_id
      and u.conversation_id=new.conversation_id
      and u.batch_id=new.batch_id
      and u.event_type='UNDERSTOOD'
    order by u.created_at desc,u.id desc limit 1;
  end if;

  if v_episode is null and new.source_kind='action' and new.source_id is not null then
    select l.episode_id into v_episode
    from public.dabbir_ai_action_ledger l
    where l.business_id=new.business_id and l.id=new.source_id;
  elsif v_episode is null and new.source_kind='handoff' and new.source_id is not null then
    select h.episode_id into v_episode
    from public.dabbir_handoffs h
    where h.business_id=new.business_id and h.id=new.source_id;
  elsif v_episode is null and new.source_kind='outbound' then
    select nullif(s.semantic_state#>>'{v3_runtime,episode_id}','') into v_episode
    from public.dabbir_ai_conversation_state s
    where s.business_id=new.business_id and s.conversation_id=new.conversation_id;
  end if;

  if new.episode_id is null then new.episode_id:=v_episode; end if;
  if new.stage='DECIDE' and v_batch_engine='V3' and new.episode_id is null then
    raise exception 'V3_DECISION_EPISODE_ID_REQUIRED';
  end if;
  return new;
end;
$$;
revoke all on function dabbir_private.bind_operator_episode_v1() from public,anon,authenticated;

drop trigger if exists dabbir_bind_operator_episode on public.dabbir_ai_operator_events;
create trigger dabbir_bind_operator_episode
before insert on public.dabbir_ai_operator_events
for each row execute function dabbir_private.bind_operator_episode_v1();

-- Booking mutations are the critical tail. A V3 mutation without correlation is
-- rejected at the ledger write, while legacy/V2 rows remain valid and nullable.
create or replace function dabbir_private.bind_action_episode_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_episode text;v_engine text;
begin
  select nullif(s.semantic_state#>>'{v3_runtime,episode_id}',''),
         nullif(s.semantic_state#>>'{v3_engine,engine}','')
    into v_episode,v_engine
  from public.dabbir_ai_conversation_state s
  where s.business_id=new.business_id and s.conversation_id=new.conversation_id;

  if new.episode_id is null then new.episode_id:=v_episode; end if;
  if v_engine='V3' and new.episode_id is null then raise exception 'V3_ACTION_EPISODE_ID_REQUIRED'; end if;
  if v_engine='V3' and v_episode is not null and new.episode_id is distinct from v_episode then
    raise exception 'V3_ACTION_EPISODE_ID_MISMATCH';
  end if;
  return new;
end;
$$;
revoke all on function dabbir_private.bind_action_episode_v1() from public,anon,authenticated;

drop trigger if exists dabbir_bind_action_episode on public.dabbir_ai_action_ledger;
create trigger dabbir_bind_action_episode
before insert on public.dabbir_ai_action_ledger
for each row execute function dabbir_private.bind_action_episode_v1();

-- Human handoff is safety critical: attach correlation when available, but never
-- block a legitimate emergency handoff solely because measurement metadata is absent.
create or replace function dabbir_private.bind_handoff_episode_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_episode text;
begin
  if new.episode_id is null then
    select nullif(s.semantic_state#>>'{v3_runtime,episode_id}','') into v_episode
    from public.dabbir_ai_conversation_state s
    where s.business_id=new.business_id and s.conversation_id=new.conversation_id;
    new.episode_id:=v_episode;
  end if;
  return new;
end;
$$;
revoke all on function dabbir_private.bind_handoff_episode_v1() from public,anon,authenticated;

drop trigger if exists dabbir_bind_handoff_episode on public.dabbir_handoffs;
create trigger dabbir_bind_handoff_episode
before insert on public.dabbir_handoffs
for each row execute function dabbir_private.bind_handoff_episode_v1();

-- Funnel rows inherit correlation from their durable source. This is intentionally
-- not derived from "current conversation state" because appointment/payment events
-- may happen long after the customer has started a different episode.
create or replace function dabbir_private.bind_booking_funnel_episode_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_episode text;
begin
  if new.episode_id is not null then return new; end if;

  if new.source_kind='decision' and new.source_id is not null then
    select o.episode_id into v_episode from public.dabbir_ai_operator_events o
    where o.business_id=new.business_id and o.id=new.source_id;
  elsif new.source_kind='action' and new.source_id is not null then
    select l.episode_id into v_episode from public.dabbir_ai_action_ledger l
    where l.business_id=new.business_id and l.id=new.source_id;
  elsif new.source_kind in ('appointment','payment') and new.appointment_id is not null then
    select l.episode_id into v_episode
    from public.dabbir_ai_action_ledger l
    where l.business_id=new.business_id
      and l.conversation_id=new.conversation_id
      and l.entity_id=new.appointment_id
      and l.operation_type='booking.create'
      and l.episode_id is not null
    order by l.created_at asc,l.id asc limit 1;
  end if;

  new.episode_id:=v_episode;
  return new;
end;
$$;
revoke all on function dabbir_private.bind_booking_funnel_episode_v1() from public,anon,authenticated;

drop trigger if exists dabbir_bind_booking_funnel_episode on public.dabbir_ai_booking_funnel_events;
create trigger dabbir_bind_booking_funnel_episode
before insert on public.dabbir_ai_booking_funnel_events
for each row execute function dabbir_private.bind_booking_funnel_episode_v1();

-- Read-only booking episode truth. Outcome is derived from evidence; no planner,
-- trigger or UI is allowed to overwrite a final label.
create or replace view public.dabbir_ai_booking_episode_outcomes_v1
with (security_invoker=true)
as
with episodes as (
  select
    e.business_id,e.conversation_id,e.episode_id,
    min(e.created_at) as episode_started_at,
    max(e.created_at) as last_understanding_at,
    (array_agg(nullif(e.metrics->>'goal','') order by e.created_at asc,e.id asc)
      filter(where nullif(e.metrics->>'goal','') is not null))[1] as initial_goal,
    (array_agg(nullif(e.metrics->>'goal','') order by e.created_at desc,e.id desc)
      filter(where nullif(e.metrics->>'goal','') is not null))[1] as latest_goal,
    count(*) filter(where e.event_type='UNDERSTOOD') as understanding_turns,
    count(*) filter(where e.event_type='UNDERSTOOD' and e.metrics->>'action'='CLARIFY') as clarification_turns
  from public.dabbir_ai_understanding_events e
  where e.episode_id is not null
  group by e.business_id,e.conversation_id,e.episode_id
), funnel as (
  select
    f.business_id,f.conversation_id,f.episode_id,
    max(f.occurred_at) as last_funnel_at,
    (array_agg(f.stage order by f.occurred_at desc,f.id desc))[1] as latest_stage,
    bool_or(f.verification_class='PROVIDER_CALLBACK' and f.stage in ('BOOKED','CONFIRMED','RESCHEDULED','CANCELLED','COMPLETED')) as has_verified_external,
    bool_or(f.verification_class='DATABASE_COMMIT' and f.source_kind='action' and f.stage in ('BOOKED','CONFIRMED','RESCHEDULED','CANCELLED')) as has_ai_action_commit,
    bool_or(f.verification_class='DATABASE_COMMIT' and f.stage in ('BOOKED','CONFIRMED','RESCHEDULED','CANCELLED','COMPLETED')) as has_database_commit,
    bool_or(f.verification_class='HUMAN_CONFIRMED' and f.stage in ('BOOKED','CONFIRMED','RESCHEDULED','CANCELLED','COMPLETED')) as has_human_confirmed,
    min(f.occurred_at) filter(where f.verification_class in ('PROVIDER_CALLBACK','DATABASE_COMMIT','HUMAN_CONFIRMED') and f.stage in ('BOOKED','CONFIRMED','RESCHEDULED','CANCELLED','COMPLETED')) as terminal_evidence_at
  from public.dabbir_ai_booking_funnel_events f
  where f.episode_id is not null
  group by f.business_id,f.conversation_id,f.episode_id
), handoffs as (
  select
    h.business_id,h.conversation_id,h.episode_id,
    count(*) as handoff_count,
    bool_or(lower(coalesce(h.reason,'')) ~ '(provider|gateway|interpreter|retry|unavailable|timeout|quality)') as has_infra_handoff,
    max(h.updated_at) as last_handoff_at,
    (array_agg(h.state order by h.updated_at desc,h.id desc))[1] as latest_handoff_state
  from public.dabbir_handoffs h
  where h.episode_id is not null
  group by h.business_id,h.conversation_id,h.episode_id
)
select
  e.business_id,e.conversation_id,e.episode_id,
  case when e.episode_id like 'legacy-v3:%' then 'LEGACY_V3_DERIVED' else 'RUNTIME_NATIVE' end as correlation_epoch,
  e.episode_started_at,e.last_understanding_at,e.initial_goal,e.latest_goal,
  e.understanding_turns,e.clarification_turns,
  f.latest_stage,f.last_funnel_at,f.terminal_evidence_at,
  coalesce(h.handoff_count,0) as handoff_count,
  h.latest_handoff_state,h.last_handoff_at,
  case
    when coalesce(f.has_verified_external,false) then 'VERIFIED_EXTERNAL'
    when coalesce(f.has_ai_action_commit,false) then 'COMMITTED'
    when coalesce(f.has_human_confirmed,false) then 'HUMAN_RESOLVED'
    when coalesce(h.handoff_count,0)>0 and coalesce(h.has_infra_handoff,false) then 'INFRA_HANDOFF'
    when coalesce(h.handoff_count,0)>0 then 'HUMAN_HANDOFF'
    else 'UNRESOLVED'
  end as episode_outcome,
  case
    when coalesce(f.has_ai_action_commit,false) then 'AI'
    when coalesce(f.has_human_confirmed,false) then 'HUMAN'
    else 'UNKNOWN'
  end as completed_by,
  coalesce(f.has_ai_action_commit,false) as ai_completed,
  coalesce(f.has_verified_external,false) as verified_external_result,
  coalesce(f.has_database_commit,false) as database_commit_present,
  case
    when coalesce(f.has_verified_external,false) or coalesce(f.has_ai_action_commit,false) or coalesce(f.has_human_confirmed,false) then true
    else false
  end as resolved
from episodes e
left join funnel f on f.business_id=e.business_id and f.conversation_id=e.conversation_id and f.episode_id=e.episode_id
left join handoffs h on h.business_id=e.business_id and h.conversation_id=e.conversation_id and h.episode_id=e.episode_id
where e.latest_goal in ('BOOK_SERVICE','RESCHEDULE_BOOKING','CANCEL_BOOKING')
   or f.episode_id is not null;

grant select on public.dabbir_ai_booking_episode_outcomes_v1 to authenticated,service_role;

comment on view public.dabbir_ai_booking_episode_outcomes_v1 is
  'Derived booking episode truth. Committed evidence outranks handoff/planner labels; completed_by distinguishes AI, HUMAN and UNKNOWN. No writable outcome claim.';
