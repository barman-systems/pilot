-- DABBIR Episode Outcome Projection V1
-- Read-only truth for booking/reschedule/cancel episodes. No writable outcome
-- column is introduced; evidence is re-evaluated every time the view is read.

create or replace view public.dabbir_ai_booking_episode_outcomes_v1
with (security_invoker=true)
as
with episodes as (
  select
    e.business_id,
    e.conversation_id,
    e.episode_id,
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
    f.business_id,
    f.conversation_id,
    f.episode_id,
    max(f.occurred_at) as last_funnel_at,
    (array_agg(f.stage order by f.occurred_at desc,f.id desc))[1] as latest_stage,
    bool_or(f.verification_class='PROVIDER_CALLBACK'
      and f.stage in ('BOOKED','CONFIRMED','RESCHEDULED','CANCELLED','COMPLETED')) as has_verified_external,
    bool_or(f.verification_class='DATABASE_COMMIT'
      and f.source_kind='action'
      and f.stage in ('BOOKED','CONFIRMED','RESCHEDULED','CANCELLED')) as has_ai_action_commit,
    bool_or(f.verification_class='DATABASE_COMMIT'
      and f.stage in ('BOOKED','CONFIRMED','RESCHEDULED','CANCELLED','COMPLETED')) as has_database_commit,
    bool_or(f.verification_class='HUMAN_CONFIRMED'
      and f.stage in ('BOOKED','CONFIRMED','RESCHEDULED','CANCELLED','COMPLETED')) as has_human_confirmed,
    min(f.occurred_at) filter(
      where f.verification_class in ('PROVIDER_CALLBACK','DATABASE_COMMIT','HUMAN_CONFIRMED')
        and f.stage in ('BOOKED','CONFIRMED','RESCHEDULED','CANCELLED','COMPLETED')
    ) as terminal_evidence_at
  from public.dabbir_ai_booking_funnel_events f
  where f.episode_id is not null
  group by f.business_id,f.conversation_id,f.episode_id
), handoffs as (
  select
    h.business_id,
    h.conversation_id,
    h.episode_id,
    count(*) as handoff_count,
    bool_or(lower(coalesce(h.reason,'')) ~ '(provider|gateway|interpreter|retry|unavailable|timeout|quality)') as has_infra_handoff,
    max(h.updated_at) as last_handoff_at,
    (array_agg(h.state order by h.updated_at desc,h.id desc))[1] as latest_handoff_state
  from public.dabbir_handoffs h
  where h.episode_id is not null
  group by h.business_id,h.conversation_id,h.episode_id
)
select
  e.business_id,
  e.conversation_id,
  e.episode_id,
  case when e.episode_id like 'legacy-v3:%' then 'LEGACY_V3_DERIVED' else 'RUNTIME_NATIVE' end as correlation_epoch,
  case when e.episode_id like 'legacy-v3:%' then 'HISTORICAL_HANDOFF_PARTIAL' else 'CAUSAL_NATIVE' end as handoff_correlation_mode,
  e.episode_started_at,
  e.last_understanding_at,
  e.initial_goal,
  e.latest_goal,
  e.understanding_turns,
  e.clarification_turns,
  f.latest_stage,
  f.last_funnel_at,
  f.terminal_evidence_at,
  coalesce(h.handoff_count,0) as handoff_count,
  h.latest_handoff_state,
  h.last_handoff_at,
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
    when coalesce(f.has_verified_external,false)
      or coalesce(f.has_ai_action_commit,false)
      or coalesce(f.has_human_confirmed,false)
    then true else false
  end as resolved
from episodes e
left join funnel f
  on f.business_id=e.business_id and f.conversation_id=e.conversation_id and f.episode_id=e.episode_id
left join handoffs h
  on h.business_id=e.business_id and h.conversation_id=e.conversation_id and h.episode_id=e.episode_id
where e.latest_goal in ('BOOK_SERVICE','RESCHEDULE_BOOKING','CANCEL_BOOKING')
   or f.episode_id is not null;

grant select on public.dabbir_ai_booking_episode_outcomes_v1 to authenticated,service_role;

comment on view public.dabbir_ai_booking_episode_outcomes_v1 is
  'Derived booking episode truth. Committed evidence outranks handoff/planner labels; completed_by distinguishes AI, HUMAN and UNKNOWN. Historical handoff attribution is explicitly partial. No writable outcome claim.';
