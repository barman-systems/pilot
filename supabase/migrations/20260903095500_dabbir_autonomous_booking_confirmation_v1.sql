-- DABBIR autonomous booking confirmation v1.
-- Product invariant: WhatsApp/web bookings never wait for owner/employee approval.
-- The booking is written immediately. A configured deposit may gate confirmation,
-- but the only human-side action in the normal path is a notification.

create or replace function dabbir_private.enforce_external_booking_confirmation_gate()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_deposit_enabled boolean := false;
begin
  if new.booking_source in ('whatsapp','web') then
    select coalesce(s.deposit_enabled,false)
      into v_deposit_enabled
    from public.dabbir_salon_settings s
    where s.business_id=new.business_id;

    new.owner_approval_status := 'not_required';
    new.owner_approval_requested_at := null;
    new.owner_decision_at := null;
    new.owner_decided_by := null;

    if coalesce(v_deposit_enabled,false) then
      new.confirmation_gate := 'deposit';
      if new.payment_status in ('partial','paid') then
        new.status := 'confirmed';
        new.deposit_paid_at := coalesce(new.deposit_paid_at,now());
      else
        -- The appointment exists immediately and reserves the slot, but remains
        -- awaiting the configured deposit rather than a human approval.
        new.status := 'new';
      end if;
    else
      new.confirmation_gate := 'none';
      new.status := 'confirmed';
    end if;
  else
    new.confirmation_gate := 'none';
    new.owner_approval_status := 'not_required';
    new.owner_approval_requested_at := null;
  end if;
  return new;
end;
$$;
revoke all on function dabbir_private.enforce_external_booking_confirmation_gate() from public,anon,authenticated;

-- Owner approval is no longer a valid booking state. Keep the historical columns
-- for backwards-compatible reads, while making writes fail closed if old code tries
-- to reintroduce owner approval.
create or replace function dabbir_private.guard_owner_booking_decision()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.confirmation_gate='owner_approval'
     or new.owner_approval_status in ('pending_owner','approved','rejected') then
    raise exception 'BOOKING_OWNER_APPROVAL_DISABLED';
  end if;

  if old.confirmation_gate='deposit'
     and new.confirmation_gate is distinct from old.confirmation_gate then
    raise exception 'BOOKING_CONFIRMATION_GATE_IMMUTABLE';
  end if;

  return new;
end;
$$;
revoke all on function dabbir_private.guard_owner_booking_decision() from public,anon,authenticated;

-- Retire the old approval RPC from normal authenticated use so stale clients cannot
-- recreate a human approval dependency.
revoke all on function public.dabbir_salon_owner_decide_booking(uuid,uuid,text) from public,anon,authenticated;

-- Convert any existing no-deposit external booking still waiting for human approval
-- into the autonomous path. Cancelled rows stay cancelled; active new rows confirm.
update public.dabbir_appointments a
set confirmation_gate='none',
    owner_approval_status='not_required',
    owner_approval_requested_at=null,
    owner_decision_at=null,
    owner_decided_by=null,
    status=case when a.status='new' then 'confirmed' else a.status end,
    updated_at=now()
where a.booking_source in ('whatsapp','web')
  and a.confirmation_gate='owner_approval';

-- Remove obsolete internal approval tasks. Customer confirmation/reminders remain
-- untouched; cancellation logic below still cancels them when the booking is cancelled.
update public.dabbir_workflow_notifications n
set status='cancelled',updated_at=now(),last_error=null
where n.channel='internal'
  and n.idempotency_key like 'appointment:%:owner_approval_required'
  and n.status in ('pending','processing');

create or replace function dabbir_private.handle_booking_confirmation_gate_notifications()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(
    select 1 from public.dabbir_businesses b
    where b.id=new.business_id and b.business_type='salon'
  ) then return new; end if;

  -- No INSERT path creates a human approval task. The normal booking path is
  -- autonomous; the team receives ordinary booking notifications only.
  if tg_op='UPDATE' then
    if old.confirmation_gate='owner_approval' then
      update public.dabbir_workflow_notifications n
         set status='cancelled',updated_at=now(),last_error=null
       where n.business_id=new.business_id
         and n.appointment_id=new.id
         and n.channel='internal'
         and n.idempotency_key='appointment:'||new.id||':owner_approval_required'
         and n.status in ('pending','processing');
    end if;

    if new.status='cancelled' and old.status is distinct from 'cancelled' then
      update public.dabbir_workflow_notifications n
         set status='cancelled',updated_at=now()
       where n.business_id=new.business_id
         and n.appointment_id=new.id
         and n.status in ('pending','processing')
         and (n.channel='internal' or n.notification_type in ('booking_confirmation','reminder_24h','reminder_2h'));
    end if;
  end if;
  return new;
end;
$$;
revoke all on function dabbir_private.handle_booking_confirmation_gate_notifications() from public,anon,authenticated;

comment on function dabbir_private.enforce_external_booking_confirmation_gate() is
  'DABBIR invariant: WhatsApp/web bookings write immediately; no-deposit bookings confirm immediately; configured deposits may gate confirmation; owner approval is never in the normal booking path.';
