-- DABBIR Episode Correlation Authority V1 — schema + binding
-- Carries the existing V3 runtime episode_id into durable evidence without
-- introducing a second episode detector or rewriting legacy/V2 history.

alter table public.dabbir_ai_understanding_events add column if not exists episode_id text;
alter table public.dabbir_ai_operator_events add column if not exists episode_id text;
alter table public.dabbir_ai_action_ledger add column if not exists episode_id text;
alter table public.dabbir_ai_booking_funnel_events add column if not exists episode_id text;
alter table public.dabbir_handoffs add column if not exists episode_id text;

alter table public.dabbir_ai_understanding_events drop constraint if exists dabbir_ai_understanding_episode_id_check;
alter table public.dabbir_ai_understanding_events add constraint dabbir_ai_understanding_episode_id_check check (episode_id is null or char_length(episode_id) between 8 and 220);
alter table public.dabbir_ai_operator_events drop constraint if exists dabbir_ai_operator_episode_id_check;
alter table public.dabbir_ai_operator_events add constraint dabbir_ai_operator_episode_id_check check (episode_id is null or char_length(episode_id) between 8 and 220);
alter table public.dabbir_ai_action_ledger drop constraint if exists dabbir_ai_action_episode_id_check;
alter table public.dabbir_ai_action_ledger add constraint dabbir_ai_action_episode_id_check check (episode_id is null or char_length(episode_id) between 8 and 220);
alter table public.dabbir_ai_booking_funnel_events drop constraint if exists dabbir_ai_booking_funnel_episode_id_check;
alter table public.dabbir_ai_booking_funnel_events add constraint dabbir_ai_booking_funnel_episode_id_check check (episode_id is null or char_length(episode_id) between 8 and 220);
alter table public.dabbir_handoffs drop constraint if exists dabbir_handoffs_episode_id_check;
alter table public.dabbir_handoffs add constraint dabbir_handoffs_episode_id_check check (episode_id is null or char_length(episode_id) between 8 and 220);

create index if not exists dabbir_ai_understanding_episode_idx on public.dabbir_ai_understanding_events(business_id,conversation_id,episode_id,created_at) where episode_id is not null;
create index if not exists dabbir_ai_operator_episode_idx on public.dabbir_ai_operator_events(business_id,conversation_id,episode_id,occurred_at) where episode_id is not null;
create index if not exists dabbir_ai_action_episode_idx on public.dabbir_ai_action_ledger(business_id,conversation_id,episode_id,created_at) where episode_id is not null;
create index if not exists dabbir_ai_booking_funnel_episode_idx on public.dabbir_ai_booking_funnel_events(business_id,conversation_id,episode_id,occurred_at) where episode_id is not null;
create index if not exists dabbir_handoffs_episode_idx on public.dabbir_handoffs(business_id,conversation_id,episode_id,created_at) where episode_id is not null;

-- Historical V3 epoch. Use the durable NEW_EPISODE event UUID itself as the
-- anchor; do not try to string-match event time to native runtime episode_id.
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
  where e.metrics->>'engine'='V3' and e.episode_id is null
)
update public.dabbir_ai_understanding_events e
set episode_id=m.derived_episode_id
from mapped m
where e.id=m.id and m.derived_episode_id is not null;

-- Decision/operator rows bind deterministically through the same message batch.
update public.dabbir_ai_operator_events o
set episode_id=u.episode_id
from public.dabbir_ai_understanding_events u
where o.episode_id is null
  and o.batch_id=u.batch_id
  and u.event_type='UNDERSTOOD'
  and u.episode_id is not null;

-- Historical action keys embed the originating batch UUID. CASE makes UUID
-- parsing fail-safe for every non-canonical key shape.
with mapped as (
  select l.id,u.episode_id
  from public.dabbir_ai_action_ledger l
  join public.dabbir_ai_understanding_events u
    on u.batch_id=case
      when l.operation_key ~ '^understanding-v2:[0-9a-fA-F-]{36}:' then split_part(l.operation_key,':',2)::uuid
      else null::uuid
    end
   and u.event_type='UNDERSTOOD'
   and u.episode_id is not null
  where l.episode_id is null
)
update public.dabbir_ai_action_ledger l
set episode_id=m.episode_id
from mapped m
where l.id=m.id;

-- Funnel history inherits only from durable source rows.
update public.dabbir_ai_booking_funnel_events f
set episode_id=o.episode_id
from public.dabbir_ai_operator_events o
where f.episode_id is null and f.source_kind='decision' and f.source_id=o.id and o.episode_id is not null;

update public.dabbir_ai_booking_funnel_events f
set episode_id=l.episode_id
from public.dabbir_ai_action_ledger l
where f.episode_id is null and f.source_kind='action' and f.source_id=l.id and l.episode_id is not null;

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

-- All existing V3 UNDERSTOOD rows are backfilled before this is installed.
-- Legacy/V2 remains nullable, but V3 understanding can never be uncorrelated.
alter table public.dabbir_ai_understanding_events drop constraint if exists dabbir_ai_understanding_v3_episode_required;
alter table public.dabbir_ai_understanding_events add constraint dabbir_ai_understanding_v3_episode_required
  check (coalesce(metrics->>'engine','')<>'V3' or episode_id is not null);

-- Only semantic-flow evidence belongs to a conversation episode. Knowledge
-- proposal/review lifecycle events intentionally remain unscoped.
create or replace function dabbir_private.bind_understanding_episode_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_episode text;v_engine text;
begin
  if new.event_type not in ('UNDERSTOOD','COGNITIVE_PRESENTED','VERIFIED_ACTION') then return new; end if;

  select nullif(s.semantic_state#>>'{v3_runtime,episode_id}',''),nullif(s.semantic_state#>>'{v3_engine,engine}','')
    into v_episode,v_engine
  from public.dabbir_ai_conversation_state s
  where s.business_id=new.business_id and s.conversation_id=new.conversation_id;

  if new.episode_id is null then new.episode_id:=v_episode; end if;
  if (coalesce(new.metrics->>'engine','')='V3' or (new.event_type='UNDERSTOOD' and v_engine='V3')) and new.episode_id is null then raise exception 'V3_EPISODE_ID_REQUIRED'; end if;
  if coalesce(new.metrics->>'engine','')='V3' and v_episode is not null and new.episode_id is distinct from v_episode then raise exception 'V3_EPISODE_ID_MISMATCH'; end if;
  return new;
end;
$$;
revoke all on function dabbir_private.bind_understanding_episode_v1() from public,anon,authenticated;
drop trigger if exists dabbir_bind_understanding_episode on public.dabbir_ai_understanding_events;
create trigger dabbir_bind_understanding_episode before insert on public.dabbir_ai_understanding_events for each row execute function dabbir_private.bind_understanding_episode_v1();

-- Pre-understanding PROCESSING/RETRY events may remain unscoped. DECIDE after a
-- V3 UNDERSTOOD event may not. Delayed outbound evidence is deliberately not
-- attached from mutable current conversation state.
create or replace function dabbir_private.bind_operator_episode_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_episode text;v_batch_engine text;
begin
  if new.batch_id is not null then
    select u.episode_id,u.metrics->>'engine' into v_episode,v_batch_engine
    from public.dabbir_ai_understanding_events u
    where u.business_id=new.business_id and u.conversation_id=new.conversation_id
      and u.batch_id=new.batch_id and u.event_type='UNDERSTOOD'
    order by u.created_at desc,u.id desc limit 1;
  end if;

  if v_episode is null and new.source_kind='action' and new.source_id is not null then
    select l.episode_id into v_episode from public.dabbir_ai_action_ledger l where l.business_id=new.business_id and l.id=new.source_id;
  elsif v_episode is null and new.source_kind='handoff' and new.source_id is not null then
    select h.episode_id into v_episode from public.dabbir_handoffs h where h.business_id=new.business_id and h.id=new.source_id;
  end if;

  if new.episode_id is null then new.episode_id:=v_episode; end if;
  if new.stage='DECIDE' and v_batch_engine='V3' and new.episode_id is null then raise exception 'V3_DECISION_EPISODE_ID_REQUIRED'; end if;
  return new;
end;
$$;
revoke all on function dabbir_private.bind_operator_episode_v1() from public,anon,authenticated;
drop trigger if exists dabbir_bind_operator_episode on public.dabbir_ai_operator_events;
create trigger dabbir_bind_operator_episode before insert on public.dabbir_ai_operator_events for each row execute function dabbir_private.bind_operator_episode_v1();

-- Critical mutation tail: a V3 action without correlation fails closed. The ID is
-- derived from canonical state, not accepted from an RPC caller.
create or replace function dabbir_private.bind_action_episode_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_episode text;v_engine text;
begin
  select nullif(s.semantic_state#>>'{v3_runtime,episode_id}',''),nullif(s.semantic_state#>>'{v3_engine,engine}','')
    into v_episode,v_engine
  from public.dabbir_ai_conversation_state s
  where s.business_id=new.business_id and s.conversation_id=new.conversation_id;

  if new.episode_id is null then new.episode_id:=v_episode; end if;
  if v_engine='V3' and new.episode_id is null then raise exception 'V3_ACTION_EPISODE_ID_REQUIRED'; end if;
  if v_engine='V3' and v_episode is not null and new.episode_id is distinct from v_episode then raise exception 'V3_ACTION_EPISODE_ID_MISMATCH'; end if;
  return new;
end;
$$;
revoke all on function dabbir_private.bind_action_episode_v1() from public,anon,authenticated;
drop trigger if exists dabbir_bind_action_episode on public.dabbir_ai_action_ledger;
create trigger dabbir_bind_action_episode before insert on public.dabbir_ai_action_ledger for each row execute function dabbir_private.bind_action_episode_v1();

-- Handoff safety outranks measurement. Bind only when the canonical V3 episode
-- was committed by the SAME message batch that is still being processed. This
-- prevents a pre-commit interpreter/provider failure from being misattributed to
-- the previous episode. If causal proof is absent, leave episode_id NULL.
create or replace function dabbir_private.bind_handoff_episode_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_episode text;v_batch uuid;
begin
  if new.episode_id is not null then return new; end if;

  select nullif(s.semantic_state#>>'{v3_runtime,episode_id}',''),s.semantic_batch_id
    into v_episode,v_batch
  from public.dabbir_ai_conversation_state s
  where s.business_id=new.business_id and s.conversation_id=new.conversation_id;

  if v_episode is not null and v_batch is not null
     and exists(
       select 1
       from public.dabbir_ai_understanding_events u
       join public.dabbir_message_batches b
         on b.id=u.batch_id and b.business_id=u.business_id and b.conversation_id=u.conversation_id
       where u.business_id=new.business_id
         and u.conversation_id=new.conversation_id
         and u.batch_id=v_batch
         and u.event_type='UNDERSTOOD'
         and u.metrics->>'engine'='V3'
         and u.episode_id=v_episode
         and b.state='PROCESSING'
     ) then
    new.episode_id:=v_episode;
  end if;
  return new;
end;
$$;
revoke all on function dabbir_private.bind_handoff_episode_v1() from public,anon,authenticated;
drop trigger if exists dabbir_bind_handoff_episode on public.dabbir_handoffs;
create trigger dabbir_bind_handoff_episode before insert on public.dabbir_handoffs for each row execute function dabbir_private.bind_handoff_episode_v1();

-- Funnel evidence follows its immutable decision/action source. Appointment and
-- payment events use the originating AI booking action, not current conversation state.
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
    select o.episode_id into v_episode from public.dabbir_ai_operator_events o where o.business_id=new.business_id and o.id=new.source_id;
  elsif new.source_kind='action' and new.source_id is not null then
    select l.episode_id into v_episode from public.dabbir_ai_action_ledger l where l.business_id=new.business_id and l.id=new.source_id;
  elsif new.source_kind in ('appointment','payment') and new.appointment_id is not null then
    select l.episode_id into v_episode
    from public.dabbir_ai_action_ledger l
    where l.business_id=new.business_id and l.conversation_id=new.conversation_id
      and l.entity_id=new.appointment_id and l.operation_type='booking.create' and l.episode_id is not null
    order by l.created_at asc,l.id asc limit 1;
  end if;

  new.episode_id:=v_episode;
  return new;
end;
$$;
revoke all on function dabbir_private.bind_booking_funnel_episode_v1() from public,anon,authenticated;
drop trigger if exists dabbir_bind_booking_funnel_episode on public.dabbir_ai_booking_funnel_events;
create trigger dabbir_bind_booking_funnel_episode before insert on public.dabbir_ai_booking_funnel_events for each row execute function dabbir_private.bind_booking_funnel_episode_v1();
