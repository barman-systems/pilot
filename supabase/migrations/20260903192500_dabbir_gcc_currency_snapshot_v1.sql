-- Live Production migration 20260903192500.
-- Currency snapshots are immutable financial truth. Neutral generated aliases let
-- runtime reads migrate away from legacy *_aed names without breaking old writers.

create or replace function dabbir_private.enforce_business_currency_snapshot()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_currency text;
begin
  if tg_op='UPDATE' then
    if new.business_id is distinct from old.business_id then raise exception 'MONEY_SNAPSHOT_BUSINESS_IMMUTABLE'; end if;
    if new.currency_code is distinct from old.currency_code then raise exception 'MONEY_SNAPSHOT_CURRENCY_IMMUTABLE'; end if;
    return new;
  end if;
  select b.currency_code into v_currency from public.dabbir_businesses b where b.id=new.business_id;
  if v_currency is null then raise exception 'BUSINESS_CURRENCY_NOT_CONFIGURED'; end if;
  if new.currency_code is null then new.currency_code:=v_currency;
  elsif new.currency_code<>v_currency then raise exception 'BUSINESS_CURRENCY_MISMATCH'; end if;
  return new;
end
$$;

create or replace function dabbir_private.enforce_appointment_currency_snapshot()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_currency text;
begin
  if tg_op='UPDATE' then
    if new.business_id is distinct from old.business_id or new.appointment_id is distinct from old.appointment_id then raise exception 'APPOINTMENT_MONEY_IDENTITY_IMMUTABLE'; end if;
    if new.currency_code is distinct from old.currency_code then raise exception 'MONEY_SNAPSHOT_CURRENCY_IMMUTABLE'; end if;
    return new;
  end if;
  select a.deposit_currency_code into v_currency from public.dabbir_appointments a where a.business_id=new.business_id and a.id=new.appointment_id;
  if v_currency is null then raise exception 'APPOINTMENT_CURRENCY_NOT_CONFIGURED'; end if;
  if new.currency_code is null then new.currency_code:=v_currency;
  elsif new.currency_code<>v_currency then raise exception 'APPOINTMENT_CURRENCY_MISMATCH'; end if;
  return new;
end
$$;

create or replace function dabbir_private.enforce_order_currency_snapshot()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_currency text;
begin
  if tg_op='UPDATE' then
    if new.business_id is distinct from old.business_id or new.order_id is distinct from old.order_id then raise exception 'ORDER_MONEY_IDENTITY_IMMUTABLE'; end if;
    if new.currency_code is distinct from old.currency_code then raise exception 'MONEY_SNAPSHOT_CURRENCY_IMMUTABLE'; end if;
    return new;
  end if;
  select o.currency_code into v_currency from public.dabbir_orders o where o.business_id=new.business_id and o.id=new.order_id;
  if v_currency is null then raise exception 'ORDER_CURRENCY_NOT_CONFIGURED'; end if;
  if new.currency_code is null then new.currency_code:=v_currency;
  elsif new.currency_code<>v_currency then raise exception 'ORDER_CURRENCY_MISMATCH'; end if;
  return new;
end
$$;

revoke all on function dabbir_private.enforce_business_currency_snapshot() from public,anon,authenticated;
revoke all on function dabbir_private.enforce_appointment_currency_snapshot() from public,anon,authenticated;
revoke all on function dabbir_private.enforce_order_currency_snapshot() from public,anon,authenticated;

alter table public.dabbir_orders add column if not exists currency_code text;
alter table public.dabbir_operational_payments add column if not exists currency_code text;
alter table public.dabbir_expenses add column if not exists currency_code text;
alter table public.dabbir_financial_evidence add column if not exists currency_code text;
alter table public.dabbir_commissions add column if not exists currency_code text;
alter table public.dabbir_car_wash_booking_requests add column if not exists currency_code text;
alter table public.dabbir_order_returns add column if not exists currency_code text;

update public.dabbir_orders o set currency_code=b.currency_code from public.dabbir_businesses b where b.id=o.business_id and o.currency_code is null;
update public.dabbir_operational_payments p set currency_code=a.deposit_currency_code from public.dabbir_appointments a where a.business_id=p.business_id and a.id=p.appointment_id and p.currency_code is null;
update public.dabbir_expenses e set currency_code=b.currency_code from public.dabbir_businesses b where b.id=e.business_id and e.currency_code is null;
update public.dabbir_financial_evidence e set currency_code=b.currency_code from public.dabbir_businesses b where b.id=e.business_id and e.currency_code is null;
update public.dabbir_commissions c set currency_code=a.deposit_currency_code from public.dabbir_appointments a where a.business_id=c.business_id and a.id=c.appointment_id and c.currency_code is null;
update public.dabbir_car_wash_booking_requests r set currency_code=b.currency_code from public.dabbir_businesses b where b.id=r.business_id and r.currency_code is null;
update public.dabbir_order_returns r set currency_code=o.currency_code from public.dabbir_orders o where o.business_id=r.business_id and o.id=r.order_id and r.currency_code is null;

alter table public.dabbir_orders alter column currency_code set not null;
alter table public.dabbir_operational_payments alter column currency_code set not null;
alter table public.dabbir_expenses alter column currency_code set not null;
alter table public.dabbir_financial_evidence alter column currency_code set not null;
alter table public.dabbir_commissions alter column currency_code set not null;
alter table public.dabbir_car_wash_booking_requests alter column currency_code set not null;
alter table public.dabbir_order_returns alter column currency_code set not null;

alter table public.dabbir_orders add constraint dabbir_orders_currency_code_check check (currency_code ~ '^[A-Z]{3}$');
alter table public.dabbir_operational_payments add constraint dabbir_operational_payments_currency_code_check check (currency_code ~ '^[A-Z]{3}$');
alter table public.dabbir_expenses add constraint dabbir_expenses_currency_code_check check (currency_code ~ '^[A-Z]{3}$');
alter table public.dabbir_financial_evidence add constraint dabbir_financial_evidence_currency_code_check check (currency_code ~ '^[A-Z]{3}$');
alter table public.dabbir_commissions add constraint dabbir_commissions_currency_code_check check (currency_code ~ '^[A-Z]{3}$');
alter table public.dabbir_car_wash_booking_requests add constraint dabbir_car_wash_booking_requests_currency_code_check check (currency_code ~ '^[A-Z]{3}$');
alter table public.dabbir_order_returns add constraint dabbir_order_returns_currency_code_check check (currency_code ~ '^[A-Z]{3}$');

drop trigger if exists dabbir_orders_currency_snapshot on public.dabbir_orders;
create trigger dabbir_orders_currency_snapshot before insert or update on public.dabbir_orders for each row execute function dabbir_private.enforce_business_currency_snapshot();
drop trigger if exists dabbir_expenses_currency_snapshot on public.dabbir_expenses;
create trigger dabbir_expenses_currency_snapshot before insert or update on public.dabbir_expenses for each row execute function dabbir_private.enforce_business_currency_snapshot();
drop trigger if exists dabbir_financial_evidence_currency_snapshot on public.dabbir_financial_evidence;
create trigger dabbir_financial_evidence_currency_snapshot before insert or update on public.dabbir_financial_evidence for each row execute function dabbir_private.enforce_business_currency_snapshot();
drop trigger if exists dabbir_car_wash_booking_currency_snapshot on public.dabbir_car_wash_booking_requests;
create trigger dabbir_car_wash_booking_currency_snapshot before insert or update on public.dabbir_car_wash_booking_requests for each row execute function dabbir_private.enforce_business_currency_snapshot();

drop trigger if exists dabbir_operational_payments_currency_snapshot on public.dabbir_operational_payments;
create trigger dabbir_operational_payments_currency_snapshot before insert or update on public.dabbir_operational_payments for each row execute function dabbir_private.enforce_appointment_currency_snapshot();
drop trigger if exists dabbir_commissions_currency_snapshot on public.dabbir_commissions;
create trigger dabbir_commissions_currency_snapshot before insert or update on public.dabbir_commissions for each row execute function dabbir_private.enforce_appointment_currency_snapshot();

drop trigger if exists dabbir_order_returns_currency_snapshot on public.dabbir_order_returns;
create trigger dabbir_order_returns_currency_snapshot before insert or update on public.dabbir_order_returns for each row execute function dabbir_private.enforce_order_currency_snapshot();

alter table public.dabbir_products add column if not exists price_amount numeric(14,3) generated always as (price_aed) stored;
alter table public.dabbir_services add column if not exists price_amount numeric(14,3) generated always as (price_aed) stored;
alter table public.dabbir_worker_services add column if not exists price_amount numeric(14,3) generated always as (price_aed) stored;
alter table public.dabbir_appointments add column if not exists quoted_price_amount numeric(14,3) generated always as (quoted_price_aed) stored;
alter table public.dabbir_appointments add column if not exists discount_amount numeric(14,3) generated always as (discount_aed) stored;
alter table public.dabbir_appointments add column if not exists visit_fee_amount numeric(14,3) generated always as (visit_fee_aed) stored;
alter table public.dabbir_appointments add column if not exists currency_code text generated always as (deposit_currency_code) stored;
alter table public.dabbir_appointment_services add column if not exists unit_price_amount numeric(14,3) generated always as (unit_price_aed) stored;
alter table public.dabbir_appointment_services add column if not exists discount_amount numeric(14,3) generated always as (discount_aed) stored;
alter table public.dabbir_orders add column if not exists total_amount numeric(14,3) generated always as (total_aed) stored;
alter table public.dabbir_orders add column if not exists paid_amount numeric(14,3) generated always as (paid_aed) stored;
alter table public.dabbir_order_items add column if not exists unit_price_amount numeric(14,3) generated always as (unit_price_aed) stored;
alter table public.dabbir_order_items add column if not exists line_total_amount numeric(14,3) generated always as (line_total_aed) stored;
alter table public.dabbir_order_returns add column if not exists refund_amount numeric(14,3) generated always as (refund_aed) stored;
alter table public.dabbir_operational_payments add column if not exists amount numeric(14,3) generated always as (amount_aed) stored;
alter table public.dabbir_expenses add column if not exists amount numeric(14,3) generated always as (amount_aed) stored;
alter table public.dabbir_financial_evidence add column if not exists amount numeric(14,3) generated always as (amount_aed) stored;
alter table public.dabbir_commissions add column if not exists revenue_amount numeric(14,3) generated always as (revenue_aed) stored;
alter table public.dabbir_commissions add column if not exists commission_amount numeric(14,3) generated always as (commission_aed) stored;
alter table public.dabbir_commissions add column if not exists salon_gross_amount numeric(14,3) generated always as (salon_gross_aed) stored;
alter table public.dabbir_home_service_settings add column if not exists default_visit_fee_amount numeric(14,3) generated always as (default_visit_fee_aed) stored;
alter table public.dabbir_car_wash_offers add column if not exists saloon_price_amount numeric(14,3) generated always as (saloon_price_aed) stored;
alter table public.dabbir_car_wash_offers add column if not exists station_price_amount numeric(14,3) generated always as (station_price_aed) stored;
alter table public.dabbir_car_wash_booking_requests add column if not exists quoted_price_amount numeric(14,3) generated always as (quoted_price_aed) stored;
alter table public.dabbir_clinic_packages add column if not exists price_amount numeric(14,3) generated always as (price_aed) stored;
alter table public.dabbir_cash_guardian_settings add column if not exists buffer_threshold_amount numeric(14,3) generated always as (buffer_threshold_aed) stored;
