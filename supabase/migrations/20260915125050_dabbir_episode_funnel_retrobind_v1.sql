-- DABBIR Episode Correlation Authority V1 — action-to-funnel retro-bind
-- Appointment INSERT happens before the booking action-ledger INSERT. Once the
-- authoritative AI action exists and its episode is bound, repair any earlier
-- appointment/payment funnel evidence for that same appointment.

create or replace function dabbir_private.propagate_action_episode_to_funnel_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.episode_id is null or new.entity_id is null then return new; end if;
  if new.operation_type not in ('booking.create','booking.reschedule','booking.cancel') then return new; end if;

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
