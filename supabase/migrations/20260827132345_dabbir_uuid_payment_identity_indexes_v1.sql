-- Cover foreign-key access paths introduced by the UUID payment identity model.
create index if not exists dabbir_offers_created_by_user_idx
  on public.dabbir_offers(created_by_user_id)
  where created_by_user_id is not null;

create index if not exists dabbir_offers_creator_route_idx
  on public.dabbir_offers(creator_id,creator_business_id);

create index if not exists dabbir_payment_accounts_creator_business_idx
  on public.dabbir_payment_accounts(creator_id,business_id);

create index if not exists dabbir_payments_account_route_idx
  on public.dabbir_payments(payment_account_id,creator_id,recipient_business_id,provider,environment);

create index if not exists dabbir_payments_payer_customer_idx
  on public.dabbir_payments(payer_customer_id)
  where payer_customer_id is not null;
