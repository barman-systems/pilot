begin;

-- External bookings are never silently confirmed.
-- WhatsApp/web bookings use exactly one confirmation gate:
-- 1) deposit enabled -> confirm after a real positive payment;
-- 2) no deposit -> require an explicit decision from the business owner.

alter table public.dabbir_appointments
  add column if not exists confirmation_gate text not null default 'none',
  add column if not exists owner_approval_status text not null default 'not_required',
  add column if not exists owner_approval_requested_at timestamptz,
  add column if not exists owner_decision_at timestamptz,
  add column if not exists owner_decided_by uuid references auth.users(id) on delete set null,
  add column if not exists deposit_paid_at timestamptz;

alter table public.dabbir_appointments
  drop constraint if exists dabbir_appointments_confirmation_gate_check;
alter table public.dabbir_appointments
  add constraint dabbir_appointments_confirmation_gate_check
  check (confirmation_gate in ('none','owner_approval','deposit'));

alter table public.dabbir_appointments
  drop constraint if exists dabbir_appointments_owner_approval_status_check;
alter table public.dabbir_appointments
  add constraint dabbir_appointments_owner_approval_status_check
  check (owner_approval_status in ('not_required','pending_owner','approved','rejected'));

create index if not exists dabbir_appointments_pending_owner_approval_idx
  on public.dabbir_appointments(business_id,starts_at,created_at)
  where confirmation_gate='owner_approval' and owner_approval_status='pending_owner' and status='new';

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

    if coalesce(v_deposit_enabled,false) then
      new.confirmation_gate := 'deposit';
      new.owner_approval_status := 'not_required';
      new.owner_approval_requested_at := null;
      if new.payment_status in ('partial','paid') then
        new.status := 'confirmed';
        new.deposit_paid_at := coalesce(new.deposit_paid_at,now());
      else
        new.status := 'new';
      end if;
    else
      new.confirmation_gate := 'owner_approval';
      new.owner_approval_status := 'pending_owner';
      new.owner_approval_requested_at := coalesce(new.owner_approval_requested_at,now());
      new.status := 'new';
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

drop trigger if exists dabbir_external_booking_confirmation_gate on public.dabbir_appointments;
create trigger dabbir_external_booking_confirmation_gate
before insert on public.dabbir_appointments
for each row execute function dabbir_private.enforce_external_booking_confirmation_gate();

create or replace function dabbir_private.guard_owner_booking_decision()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_is_owner boolean := false;
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
        and m.role='owner'
    ) into v_is_owner;

    if new.status='confirmed' or new.owner_approval_status='approved' then
      if not v_is_owner then raise exception 'OWNER_APPROVAL_REQUIRED'; end if;
      new.status := 'confirmed';
      new.owner_approval_status := 'approved';
      new.owner_decision_at := now();
      new.owner_decided_by := (select auth.uid());
    elsif new.owner_approval_status='rejected' then
      if not v_is_owner then raise exception 'OWNER_APPROVAL_REQUIRED'; end if;
      new.status := 'cancelled';
      new.owner_decision_at := now();
      new.owner_decided_by := (select auth.uid());
    elsif new.status='cancelled' and old.status is distinct from 'cancelled' and v_is_owner then
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

drop trigger if exists dabbir_owner_booking_decision_guard on public.dabbir_appointments;
create trigger dabbir_owner_booking_decision_guard
before update of status,confirmation_gate,owner_approval_status on public.dabbir_appointments
for each row execute function dabbir_private.guard_owner_booking_decision();

create or replace function dabbir_private.auto_confirm_paid_deposit()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_net_paid numeric := 0;
begin
  select coalesce(sum(
    case when p.status='paid' then p.amount_aed
         when p.status='refunded' then -p.amount_aed
         else 0 end
  ),0)
    into v_net_paid
  from public.dabbir_operational_payments p
  where p.business_id=new.business_id
    and p.appointment_id=new.appointment_id;

  if v_net_paid>0 then
    update public.dabbir_appointments a
       set status=case when a.status='new' then 'confirmed' else a.status end,
           deposit_paid_at=coalesce(a.deposit_paid_at,now()),
           updated_at=now()
     where a.business_id=new.business_id
       and a.id=new.appointment_id
       and a.confirmation_gate='deposit'
       and a.status in ('new','confirmed');
  end if;
  return new;
end;
$$;
revoke all on function dabbir_private.auto_confirm_paid_deposit() from public,anon,authenticated;

drop trigger if exists zz_dabbir_deposit_auto_confirm on public.dabbir_operational_payments;
create trigger zz_dabbir_deposit_auto_confirm
after insert or update of status,amount_aed on public.dabbir_operational_payments
for each row execute function dabbir_private.auto_confirm_paid_deposit();

create or replace function dabbir_private.handle_booking_confirmation_gate_notifications()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_settings public.dabbir_salon_settings%rowtype;
  v_gate_satisfied boolean := false;
begin
  if not exists(
    select 1 from public.dabbir_businesses b
    where b.id=new.business_id and b.business_type='salon'
  ) then return new; end if;

  select * into v_settings
  from public.dabbir_salon_settings s
  where s.business_id=new.business_id;

  if tg_op='INSERT' and new.confirmation_gate in ('owner_approval','deposit') and new.status='new' then
    update public.dabbir_workflow_notifications n
       set status='cancelled',updated_at=now()
     where n.business_id=new.business_id
       and n.appointment_id=new.id
       and n.channel='whatsapp'
       and n.status='pending'
       and n.notification_type in ('booking_confirmation','reminder_24h','reminder_2h');

    if new.confirmation_gate='owner_approval' then
      insert into public.dabbir_workflow_notifications(
        business_id,appointment_id,customer_id,channel,notification_type,
        scheduled_for,idempotency_key,payload
      ) values(
        new.business_id,new.id,new.customer_id,'internal','follow_up',now(),
        'appointment:'||new.id||':owner_approval_required',
        jsonb_build_object(
          'event','owner_approval_required',
          'action_required','approve_or_reject',
          'appointment_id',new.id,
          'booking_source',new.booking_source,
          'starts_at',new.starts_at
        )
      ) on conflict (business_id,idempotency_key) do nothing;
    end if;
    return new;
  end if;

  if tg_op='UPDATE' then
    v_gate_satisfied :=
      (new.confirmation_gate='owner_approval' and new.owner_approval_status='approved')
      or (new.confirmation_gate='deposit' and new.deposit_paid_at is not null);

    if new.status='confirmed' and old.status is distinct from 'confirmed'
       and new.confirmation_gate in ('owner_approval','deposit') and v_gate_satisfied then
      update public.dabbir_workflow_notifications n
         set status='cancelled',updated_at=now()
       where n.business_id=new.business_id
         and n.appointment_id=new.id
         and n.channel='internal'
         and n.idempotency_key='appointment:'||new.id||':owner_approval_required'
         and n.status in ('pending','processing');

      if coalesce(v_settings.reminder_on_booking,true) then
        insert into public.dabbir_workflow_notifications(
          business_id,appointment_id,customer_id,channel,notification_type,scheduled_for,idempotency_key,payload
        ) values(
          new.business_id,new.id,new.customer_id,'whatsapp','booking_confirmation',now(),
          'appointment:'||new.id||':booking_confirmation',jsonb_build_object('appointment_id',new.id)
        ) on conflict (business_id,idempotency_key) do update
          set status='pending',scheduled_for=excluded.scheduled_for,customer_id=excluded.customer_id,
              updated_at=now(),last_error=null;
      end if;

      if coalesce(v_settings.reminder_24h,true) and new.starts_at>now()+interval '24 hours' then
        insert into public.dabbir_workflow_notifications(
          business_id,appointment_id,customer_id,channel,notification_type,scheduled_for,idempotency_key,payload
        ) values(
          new.business_id,new.id,new.customer_id,'whatsapp','reminder_24h',new.starts_at-interval '24 hours',
          'appointment:'||new.id||':reminder_24h',jsonb_build_object('appointment_id',new.id)
        ) on conflict (business_id,idempotency_key) do update
          set status='pending',scheduled_for=excluded.scheduled_for,customer_id=excluded.customer_id,
              updated_at=now(),last_error=null;
      end if;

      if coalesce(v_settings.reminder_2h,true) and new.starts_at>now()+interval '2 hours' then
        insert into public.dabbir_workflow_notifications(
          business_id,appointment_id,customer_id,channel,notification_type,scheduled_for,idempotency_key,payload
        ) values(
          new.business_id,new.id,new.customer_id,'whatsapp','reminder_2h',new.starts_at-interval '2 hours',
          'appointment:'||new.id||':reminder_2h',jsonb_build_object('appointment_id',new.id)
        ) on conflict (business_id,idempotency_key) do update
          set status='pending',scheduled_for=excluded.scheduled_for,customer_id=excluded.customer_id,
              updated_at=now(),last_error=null;
      end if;
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

drop trigger if exists zz_dabbir_booking_confirmation_gate_notifications on public.dabbir_appointments;
create trigger zz_dabbir_booking_confirmation_gate_notifications
after insert or update of status,owner_approval_status,confirmation_gate,deposit_paid_at on public.dabbir_appointments
for each row execute function dabbir_private.handle_booking_confirmation_gate_notifications();

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
      and m.role='owner'
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
    'owner_decision_at',v_row.owner_decision_at
  );
end;
$$;
revoke all on function public.dabbir_salon_owner_decide_booking(uuid,uuid,text) from public,anon;
grant execute on function public.dabbir_salon_owner_decide_booking(uuid,uuid,text) to authenticated;

commit;
