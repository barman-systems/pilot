-- DABBIR owner no-card trial v1.
-- Starts the product trial inside DABBIR without creating a Stripe customer,
-- Checkout Session, PaymentMethod, or Subscription. Only service_role may execute.

create or replace function public.dabbir_start_owner_trial_v1(p_business_id uuid)
returns table (
  started boolean,
  business_id uuid,
  status text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_row public.dabbir_billing_accounts%rowtype;
begin
  if p_business_id is null then
    raise exception 'BUSINESS_ID_REQUIRED';
  end if;

  if not exists (select 1 from public.dabbir_businesses b where b.id = p_business_id) then
    raise exception 'BUSINESS_NOT_FOUND';
  end if;

  insert into public.dabbir_billing_accounts(business_id,status,created_at,updated_at)
  values(p_business_id,'not_subscribed',v_now,v_now)
  on conflict (business_id) do nothing;

  select * into v_row
  from public.dabbir_billing_accounts a
  where a.business_id = p_business_id
  for update;

  if v_row.stripe_subscription_id is not null or v_row.stripe_customer_id is not null then
    return query select false,v_row.business_id,v_row.status,v_row.trial_started_at,v_row.trial_ends_at;
    return;
  end if;

  if v_row.trial_started_at is not null or v_row.trial_ends_at is not null then
    return query select false,v_row.business_id,v_row.status,v_row.trial_started_at,v_row.trial_ends_at;
    return;
  end if;

  update public.dabbir_billing_accounts a
  set status='trialing',
      trial_started_at=v_now,
      trial_ends_at=v_now + interval '14 days',
      cancel_at_period_end=false,
      updated_at=v_now
  where a.business_id=p_business_id
  returning a.* into v_row;

  return query select true,v_row.business_id,v_row.status,v_row.trial_started_at,v_row.trial_ends_at;
end
$$;

revoke all on function public.dabbir_start_owner_trial_v1(uuid) from public, anon, authenticated;
grant execute on function public.dabbir_start_owner_trial_v1(uuid) to service_role;

comment on function public.dabbir_start_owner_trial_v1(uuid) is
  'Starts one 14-day DABBIR owner trial without card collection. Server/service-role only and idempotent.';
