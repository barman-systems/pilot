-- DABBIR deposit/payment worst-case resilience v1.
-- Business truth first: the appointment exists before external payment succeeds.
-- Deposit satisfaction is deterministic from the payment ledger and a frozen per-booking threshold.

alter table public.dabbir_salon_settings
  add column if not exists deposit_mode text not null default 'fixed',
  add column if not exists deposit_value numeric(14,3) not null default 0;

alter table public.dabbir_salon_settings
  drop constraint if exists dabbir_salon_settings_deposit_mode_check,
  drop constraint if exists dabbir_salon_settings_deposit_policy_check;
alter table public.dabbir_salon_settings
  add constraint dabbir_salon_settings_deposit_mode_check
    check (deposit_mode in ('fixed','percentage')),
  add constraint dabbir_salon_settings_deposit_policy_check
    check (
      deposit_enabled=false
      or (deposit_mode='fixed' and deposit_value>0)
      or (deposit_mode='percentage' and deposit_value>0 and deposit_value<=100)
    );

alter table public.dabbir_appointments
  add column if not exists deposit_required_amount numeric(14,3) not null default 0,
  add column if not exists deposit_currency_code text;

update public.dabbir_appointments a
set deposit_currency_code=b.currency_code
from public.dabbir_businesses b
where b.id=a.business_id and a.deposit_currency_code is null;

alter table public.dabbir_appointments
  alter column deposit_currency_code set not null;
alter table public.dabbir_appointments
  drop constraint if exists dabbir_appointments_deposit_required_amount_check,
  drop constraint if exists dabbir_appointments_deposit_currency_code_check;
alter table public.dabbir_appointments
  add constraint dabbir_appointments_deposit_required_amount_check
    check (deposit_required_amount>=0),
  add constraint dabbir_appointments_deposit_currency_code_check
    check (deposit_currency_code ~ '^[A-Z]{3}$');

-- Freeze the commercial deposit requirement at booking creation. A later settings
-- change must never silently change what an existing customer owes.
create or replace function dabbir_private.enforce_external_booking_confirmation_gate()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_deposit_enabled boolean := false;
  v_deposit_mode text := 'fixed';
  v_deposit_value numeric := 0;
  v_currency text;
  v_minor_units integer := 2;
  v_due numeric := 0;
  v_required numeric := 0;
begin
  select coalesce(s.deposit_enabled,false),coalesce(s.deposit_mode,'fixed'),coalesce(s.deposit_value,0),
         b.currency_code,m.currency_minor_units
    into v_deposit_enabled,v_deposit_mode,v_deposit_value,v_currency,v_minor_units
  from public.dabbir_businesses b
  join public.dabbir_markets m on m.country_code=b.country_code and m.is_active=true
  left join public.dabbir_salon_settings s on s.business_id=b.id
  where b.id=new.business_id;

  if not found or v_currency is null then raise exception 'BOOKING_CURRENCY_NOT_CONFIGURED'; end if;

  new.deposit_currency_code := v_currency;
  new.deposit_required_amount := 0;

  if new.booking_source in ('whatsapp','web') then
    new.owner_approval_status := 'not_required';
    new.owner_approval_requested_at := null;
    new.owner_decision_at := null;
    new.owner_decided_by := null;

    v_due := greatest(0,coalesce(new.quoted_price_aed,0)-coalesce(new.discount_aed,0));

    if v_deposit_enabled and v_due>0 then
      if v_deposit_mode='fixed' and v_deposit_value>0 then
        v_required := least(v_deposit_value,v_due);
      elsif v_deposit_mode='percentage' and v_deposit_value>0 and v_deposit_value<=100 then
        v_required := v_due*v_deposit_value/100;
      else
        raise exception 'DEPOSIT_POLICY_NOT_CONFIGURED';
      end if;
      v_required := round(v_required,v_minor_units);
      if v_required<=0 then raise exception 'DEPOSIT_REQUIRED_AMOUNT_INVALID'; end if;

      new.deposit_required_amount := v_required;
      new.confirmation_gate := 'deposit';
      new.payment_status := 'unpaid';
      new.deposit_paid_at := null;
      new.status := 'new';
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

create or replace function dabbir_private.guard_appointment_deposit_snapshot()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.deposit_required_amount is distinct from old.deposit_required_amount
     or new.deposit_currency_code is distinct from old.deposit_currency_code then
    raise exception 'BOOKING_DEPOSIT_SNAPSHOT_IMMUTABLE';
  end if;
  return new;
end;
$$;
revoke all on function dabbir_private.guard_appointment_deposit_snapshot() from public,anon,authenticated;
drop trigger if exists dabbir_appointment_deposit_snapshot_guard on public.dabbir_appointments;
create trigger dabbir_appointment_deposit_snapshot_guard
before update of deposit_required_amount,deposit_currency_code on public.dabbir_appointments
for each row execute function dabbir_private.guard_appointment_deposit_snapshot();

-- A duplicate request may replay exactly, but must never mutate the financial identity
-- of an existing payment row. Status can only move forward: unpaid -> paid -> refunded.
create or replace function dabbir_private.guard_operational_payment_identity()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_op='UPDATE' then
    if new.business_id is distinct from old.business_id
       or new.appointment_id is distinct from old.appointment_id
       or new.customer_id is distinct from old.customer_id
       or new.amount_aed is distinct from old.amount_aed
       or new.method is distinct from old.method
       or new.idempotency_key is distinct from old.idempotency_key then
      raise exception 'PAYMENT_IDEMPOTENCY_CONFLICT';
    end if;

    if not (
      new.status=old.status
      or (old.status='unpaid' and new.status='paid')
      or (old.status='paid' and new.status='refunded')
    ) then
      raise exception 'PAYMENT_STATUS_REGRESSION';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function dabbir_private.guard_operational_payment_identity() from public,anon,authenticated;
drop trigger if exists dabbir_operational_payment_identity_guard on public.dabbir_operational_payments;
create trigger dabbir_operational_payment_identity_guard
before update on public.dabbir_operational_payments
for each row execute function dabbir_private.guard_operational_payment_identity();

alter table public.dabbir_operational_payments
  drop constraint if exists dabbir_operational_payments_idempotency_key_length_check;
alter table public.dabbir_operational_payments
  add constraint dabbir_operational_payments_idempotency_key_length_check
    check (char_length(idempotency_key) between 16 and 180);

-- Deposit state is derived from the immutable requirement plus the net ledger.
-- Refunds before the appointment starts make the deposit unsatisfied again but never
-- delete the appointment or free the slot silently.
create or replace function dabbir_private.auto_confirm_paid_deposit()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_net_paid numeric := 0;
  v_required numeric := 0;
begin
  select coalesce(sum(
    case when p.status='paid' then p.amount_aed
         when p.status='refunded' then -p.amount_aed
         else 0 end
  ),0)
    into v_net_paid
  from public.dabbir_operational_payments p
  where p.business_id=new.business_id and p.appointment_id=new.appointment_id;

  select a.deposit_required_amount into v_required
  from public.dabbir_appointments a
  where a.business_id=new.business_id and a.id=new.appointment_id
    and a.confirmation_gate='deposit';
  if not found or coalesce(v_required,0)<=0 then return new; end if;

  if v_net_paid>=v_required then
    update public.dabbir_appointments a
       set status=case when a.status='new' then 'confirmed' else a.status end,
           deposit_paid_at=coalesce(a.deposit_paid_at,now()),updated_at=now()
     where a.business_id=new.business_id and a.id=new.appointment_id
       and a.confirmation_gate='deposit' and a.status in ('new','confirmed');
  else
    update public.dabbir_appointments a
       set status=case when a.status='confirmed' and a.starts_at>now() then 'new' else a.status end,
           deposit_paid_at=null,updated_at=now()
     where a.business_id=new.business_id and a.id=new.appointment_id
       and a.confirmation_gate='deposit' and a.status in ('new','confirmed');
  end if;
  return new;
end;
$$;
revoke all on function dabbir_private.auto_confirm_paid_deposit() from public,anon,authenticated;

-- Owner/admin configuration RPC. Enabling deposit without an explicit valid value is
-- rejected by the table constraint: no hidden or guessed amount is ever used.
create or replace function public.dabbir_set_deposit_policy(
  p_business_id uuid,p_enabled boolean,p_mode text,p_value numeric
) returns table(deposit_enabled boolean,deposit_mode text,deposit_value numeric,currency_code text)
language plpgsql
security invoker
set search_path='public','pg_temp'
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(
    select 1 from public.dabbir_memberships m
    where m.business_id=p_business_id and m.user_id=auth.uid()
      and m.status='active' and m.role in ('owner','admin')
  ) then raise exception 'BUSINESS_MANAGEMENT_REQUIRED'; end if;

  insert into public.dabbir_salon_settings(business_id,deposit_enabled,deposit_mode,deposit_value,updated_at)
  values(p_business_id,coalesce(p_enabled,false),coalesce(nullif(trim(p_mode),''),'fixed'),coalesce(p_value,0),now())
  on conflict (business_id) do update set
    deposit_enabled=excluded.deposit_enabled,
    deposit_mode=excluded.deposit_mode,
    deposit_value=excluded.deposit_value,
    updated_at=now();

  return query
  select s.deposit_enabled,s.deposit_mode,s.deposit_value,b.currency_code
  from public.dabbir_salon_settings s join public.dabbir_businesses b on b.id=s.business_id
  where s.business_id=p_business_id;
end;
$$;
revoke all on function public.dabbir_set_deposit_policy(uuid,boolean,text,numeric) from public,anon;
grant execute on function public.dabbir_set_deposit_policy(uuid,boolean,text,numeric) to authenticated,service_role;

comment on column public.dabbir_appointments.deposit_required_amount is
  'Frozen required deposit in deposit_currency_code, calculated at booking creation. Never infer deposit satisfaction from payment_status alone.';
comment on column public.dabbir_appointments.deposit_currency_code is
  'Business market currency snapshot for the booking deposit requirement.';
