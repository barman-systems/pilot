-- DABBIR team invite permission gate.
-- Explicit member permissions are authoritative for booking approval.
-- A member may approve/reject a gated booking only when manage_appointments is effective.

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
    v_can_approve := dabbir_private.has_permission(old.business_id,'manage_appointments');

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
  if not dabbir_private.has_permission(p_business_id,'manage_appointments') then
    raise exception 'OWNER_APPROVAL_REQUIRED';
  end if;

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
