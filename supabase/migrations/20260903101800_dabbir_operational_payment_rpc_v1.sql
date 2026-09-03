-- Canonical operational payment commands for DABBIR.
-- Callers must supply a stable request id; DB replays exact duplicates and rejects key reuse.

create or replace function public.dabbir_record_operational_payment(
  p_business_id uuid,
  p_appointment_id uuid,
  p_amount numeric,
  p_method text,
  p_idempotency_key text,
  p_reference text default null
) returns jsonb
language plpgsql
security invoker
set search_path='public','pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_customer uuid;
  v_existing public.dabbir_operational_payments%rowtype;
  v_saved public.dabbir_operational_payments%rowtype;
  v_method text := lower(trim(coalesce(p_method,'')));
  v_key text := trim(coalesce(p_idempotency_key,''));
begin
  if v_user is null and coalesce(auth.role(),'')<>'service_role' then raise exception 'AUTH_REQUIRED'; end if;
  if v_user is not null and not exists(
    select 1 from public.dabbir_memberships m
    where m.business_id=p_business_id and m.user_id=v_user and m.status='active'
      and m.role in ('owner','admin','manager','employee','staff')
  ) then raise exception 'PAYMENT_MANAGEMENT_REQUIRED'; end if;

  if v_method not in ('cash','card','payment_link','other','unpaid') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if p_amount is null or p_amount<0 then raise exception 'INVALID_PAYMENT_AMOUNT'; end if;
  if v_method='unpaid' and p_amount<>0 then raise exception 'UNPAID_AMOUNT_MUST_BE_ZERO'; end if;
  if char_length(v_key)<16 or char_length(v_key)>180 then raise exception 'PAYMENT_IDEMPOTENCY_KEY_REQUIRED'; end if;

  select a.customer_id into v_customer
  from public.dabbir_appointments a
  where a.business_id=p_business_id and a.id=p_appointment_id;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;

  select * into v_existing
  from public.dabbir_operational_payments p
  where p.business_id=p_business_id and p.idempotency_key=v_key
  for update;

  if found then
    if v_existing.appointment_id is distinct from p_appointment_id
       or v_existing.customer_id is distinct from v_customer
       or v_existing.amount_aed is distinct from p_amount
       or v_existing.method is distinct from v_method then
      raise exception 'PAYMENT_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'payment_id',v_existing.id,'appointment_id',v_existing.appointment_id,
      'amount',v_existing.amount_aed,'method',v_existing.method,'status',v_existing.status,
      'idempotent_replay',true
    );
  end if;

  insert into public.dabbir_operational_payments(
    business_id,appointment_id,customer_id,amount_aed,method,status,reference,idempotency_key,recorded_by
  ) values(
    p_business_id,p_appointment_id,v_customer,p_amount,v_method,
    case when v_method='unpaid' then 'unpaid' else 'paid' end,
    nullif(left(trim(coalesce(p_reference,'')),240),''),v_key,v_user
  ) returning * into v_saved;

  return jsonb_build_object(
    'payment_id',v_saved.id,'appointment_id',v_saved.appointment_id,
    'amount',v_saved.amount_aed,'method',v_saved.method,'status',v_saved.status,
    'idempotent_replay',false
  );
end;
$$;
revoke all on function public.dabbir_record_operational_payment(uuid,uuid,numeric,text,text,text) from public,anon;
grant execute on function public.dabbir_record_operational_payment(uuid,uuid,numeric,text,text,text) to authenticated,service_role;

create or replace function public.dabbir_refund_operational_payment(
  p_business_id uuid,p_payment_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path='public','pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_payment public.dabbir_operational_payments%rowtype;
begin
  if v_user is null and coalesce(auth.role(),'')<>'service_role' then raise exception 'AUTH_REQUIRED'; end if;
  if v_user is not null and not exists(
    select 1 from public.dabbir_memberships m
    where m.business_id=p_business_id and m.user_id=v_user and m.status='active'
      and m.role in ('owner','admin','manager')
  ) then raise exception 'PAYMENT_REFUND_MANAGEMENT_REQUIRED'; end if;

  select * into v_payment from public.dabbir_operational_payments
  where business_id=p_business_id and id=p_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;

  if v_payment.status='refunded' then
    return jsonb_build_object('payment_id',v_payment.id,'status','refunded','idempotent_replay',true);
  end if;
  if v_payment.status<>'paid' then raise exception 'PAYMENT_NOT_REFUNDABLE'; end if;

  update public.dabbir_operational_payments
  set status='refunded'
  where business_id=p_business_id and id=p_payment_id
  returning * into v_payment;
  return jsonb_build_object('payment_id',v_payment.id,'status',v_payment.status,'idempotent_replay',false);
end;
$$;
revoke all on function public.dabbir_refund_operational_payment(uuid,uuid) from public,anon;
grant execute on function public.dabbir_refund_operational_payment(uuid,uuid) to authenticated,service_role;

-- Deposit configuration is salon-only and owner/admin controlled.
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
    join public.dabbir_businesses b on b.id=m.business_id
    where m.business_id=p_business_id and m.user_id=auth.uid()
      and m.status='active' and m.role in ('owner','admin') and b.business_type='salon'
  ) then raise exception 'BUSINESS_MANAGEMENT_REQUIRED'; end if;

  insert into public.dabbir_salon_settings(business_id,deposit_enabled,deposit_mode,deposit_value,updated_at)
  values(p_business_id,coalesce(p_enabled,false),lower(coalesce(nullif(trim(p_mode),''),'fixed')),coalesce(p_value,0),now())
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
