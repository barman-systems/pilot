-- DABBIR booking trust policy v2.
-- Keep customer communication active while an external booking awaits approval/deposit.
-- Allow active operational team members to approve or reject, not only the owner.

create or replace function dabbir_private.guard_owner_booking_decision()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_can_approve boolean := false;
begin
  if old.confirmation_gate in ('owner_approval','deposit')
     and new.confirmation_gate is distinct from old.confirmation_gate then
    raise exception 'BOOKING_CONFIRMATION_GATE_IMMUTABLE';
  end if;

  if old.confirmation_gate='owner_approval' and old.owner_approval_status='pending_owner' then
    select exists(
      select 1
      from public.dabbir_memberships m
      where m.business_id=old.business_id
        and m.user_id=(select auth.uid())
        and m.status='active'
        and m.role in ('owner','admin','manager','employee','staff')
    ) into v_can_approve;

    if new.status='confirmed' or new.owner_approval_status='approved' then
      if not v_can_approve then raise exception 'OWNER_APPROVAL_REQUIRED'; end if;
      new.status := 'confirmed';
      new.owner_approval_status := 'approved';
      new.owner_decision_at := now();
      new.owner_decided_by := (select auth.uid());
    elsif new.owner_approval_status='rejected' then
      if not v_can_approve then raise exception 'OWNER_APPROVAL_REQUIRED'; end if;
      new.status := 'cancelled';
      new.owner_decision_at := now();
      new.owner_decided_by := (select auth.uid());
    elsif new.status='cancelled' and old.status is distinct from 'cancelled' and v_can_approve then
      new.owner_approval_status := 'rejected';
      new.owner_decision_at := now();
      new.owner_decided_by := (select auth.uid());
    elsif new.owner_approval_status is distinct from old.owner_approval_status then
      raise exception 'OWNER_APPROVAL_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function dabbir_private.guard_owner_booking_decision() from public,anon,authenticated;

create or replace function public.dabbir_salon_owner_decide_booking(
  p_business_id uuid,
  p_appointment_id uuid,
  p_decision text
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_row public.dabbir_appointments%rowtype;
begin
  if p_decision not in ('approve','reject') then raise exception 'INVALID_OWNER_DECISION'; end if;
  if not exists(
    select 1 from public.dabbir_memberships m
    where m.business_id=p_business_id
      and m.user_id=(select auth.uid())
      and m.status='active'
      and m.role in ('owner','admin','manager','employee','staff')
  ) then raise exception 'OWNER_APPROVAL_REQUIRED'; end if;

  if p_decision='approve' then
    update public.dabbir_appointments
       set status='confirmed',updated_at=now()
     where business_id=p_business_id
       and id=p_appointment_id
       and confirmation_gate='owner_approval'
       and owner_approval_status='pending_owner'
       and status='new'
     returning * into v_row;
  else
    update public.dabbir_appointments
       set owner_approval_status='rejected',updated_at=now()
     where business_id=p_business_id
       and id=p_appointment_id
       and confirmation_gate='owner_approval'
       and owner_approval_status='pending_owner'
       and status='new'
     returning * into v_row;
  end if;

  if not found then raise exception 'PENDING_OWNER_BOOKING_NOT_FOUND'; end if;
  return jsonb_build_object(
    'appointment_id',v_row.id,
    'status',v_row.status,
    'confirmation_gate',v_row.confirmation_gate,
    'owner_approval_status',v_row.owner_approval_status,
    'owner_decision_at',v_row.owner_decision_at,
    'decided_by',v_row.owner_decided_by
  );
end;
$$;
revoke all on function public.dabbir_salon_owner_decide_booking(uuid,uuid,text) from public,anon;
grant execute on function public.dabbir_salon_owner_decide_booking(uuid,uuid,text) to authenticated;

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

  -- Trust rule: never silence the customer while approval/deposit is pending.
  -- The base salon workflow keeps booking_confirmation and future reminders queued.
  -- We only create the internal approval task for the business team.
  if tg_op='INSERT' and new.confirmation_gate='owner_approval' and new.status='new' then
    insert into public.dabbir_workflow_notifications(
      business_id,appointment_id,customer_id,channel,notification_type,
      scheduled_for,idempotency_key,payload
    ) values(
      new.business_id,new.id,new.customer_id,'internal','follow_up',now(),
      'appointment:'||new.id||':owner_approval_required',
      jsonb_build_object(
        'event','team_approval_required',
        'action_required','approve_or_reject',
        'appointment_id',new.id,
        'booking_source',new.booking_source,
        'starts_at',new.starts_at,
        'eligible_roles',jsonb_build_array('owner','admin','manager','employee','staff')
      )
    ) on conflict (business_id,idempotency_key) do nothing;
    return new;
  end if;

  if tg_op='UPDATE' then
    if new.status='confirmed' and old.status is distinct from 'confirmed'
       and new.confirmation_gate in ('owner_approval','deposit') then
      update public.dabbir_workflow_notifications n
         set status='cancelled',updated_at=now()
       where n.business_id=new.business_id
         and n.appointment_id=new.id
         and n.channel='internal'
         and n.idempotency_key='appointment:'||new.id||':owner_approval_required'
         and n.status in ('pending','processing');
    elsif new.status='cancelled' and old.status is distinct from 'cancelled' then
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

-- Repair pending bookings created under v1: restore customer communication that was
-- cancelled only because the confirmation gate was still pending.
update public.dabbir_workflow_notifications n
   set status='pending',updated_at=now(),last_error=null
  from public.dabbir_appointments a
 where a.id=n.appointment_id
   and a.business_id=n.business_id
   and a.confirmation_gate in ('owner_approval','deposit')
   and a.status='new'
   and n.channel='whatsapp'
   and n.status='cancelled'
   and (
     n.notification_type='booking_confirmation'
     or (n.notification_type in ('reminder_24h','reminder_2h') and n.scheduled_for>now())
   );
