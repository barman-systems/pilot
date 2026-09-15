-- DABBIR Episode Correlation Authority V1 — action-to-funnel retro-bind
-- Appointment INSERT happens before the booking.create action-ledger INSERT.
-- Once that authoritative AI creation action exists and its episode is bound,
-- repair any earlier appointment/payment funnel evidence for the same appointment.
-- Reschedule/cancel actions intentionally do not claim the appointment's original
-- creation evidence; their own action funnel event carries their episode.

create or replace function dabbir_private.propagate_action_episode_to_funnel_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.episode_id is null or new.entity_id is null then return new; end if;
  if new.operation_type<>'booking.create' then return new; end if;

  update public.dabbir_ai_booking_funnel_events f
  set episode_id=new.episode_id
  where f.business_id=new.business_id
    and f.conversation_id=new.conversation_id
    and f.appointment_id=new.entity_id
    and f.episode_id is null
    and f.source_kind in ('appointment','payment');

  return new;
end;
$$;
revoke all on function dabbir_private.propagate_action_episode_to_funnel_v1() from public,anon,authenticated;

drop trigger if exists dabbir_propagate_action_episode_to_funnel on public.dabbir_ai_action_ledger;
create trigger dabbir_propagate_action_episode_to_funnel
after insert or update of episode_id on public.dabbir_ai_action_ledger
for each row execute function dabbir_private.propagate_action_episode_to_funnel_v1();
