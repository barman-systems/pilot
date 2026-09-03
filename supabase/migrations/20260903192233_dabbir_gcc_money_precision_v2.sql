-- Live Production migration 20260903192233.
-- GCC monetary precision foundation: business money supports 3-decimal currencies
-- (BHD/KWD/OMR) without breaking legacy *_aed write names.

drop trigger if exists dabbir_operational_payment_status_sync on public.dabbir_operational_payments;
drop trigger if exists zz_dabbir_deposit_auto_confirm on public.dabbir_operational_payments;

alter table public.dabbir_appointment_services
  alter column unit_price_aed type numeric(14,3) using unit_price_aed::numeric(14,3),
  alter column discount_aed type numeric(14,3) using discount_aed::numeric(14,3);

alter table public.dabbir_appointments
  alter column quoted_price_aed type numeric(14,3) using quoted_price_aed::numeric(14,3),
  alter column discount_aed type numeric(14,3) using discount_aed::numeric(14,3),
  alter column visit_fee_aed type numeric(14,3) using visit_fee_aed::numeric(14,3);

alter table public.dabbir_car_wash_booking_requests
  alter column quoted_price_aed type numeric(14,3) using quoted_price_aed::numeric(14,3);

alter table public.dabbir_car_wash_offers
  alter column saloon_price_aed type numeric(14,3) using saloon_price_aed::numeric(14,3),
  alter column station_price_aed type numeric(14,3) using station_price_aed::numeric(14,3);

alter table public.dabbir_cash_guardian_settings
  alter column buffer_threshold_aed type numeric(14,3) using buffer_threshold_aed::numeric(14,3);

alter table public.dabbir_clinic_packages
  alter column price_aed type numeric(14,3) using price_aed::numeric(14,3);

alter table public.dabbir_commissions
  alter column revenue_aed type numeric(14,3) using revenue_aed::numeric(14,3),
  alter column commission_aed type numeric(14,3) using commission_aed::numeric(14,3),
  alter column salon_gross_aed type numeric(14,3) using salon_gross_aed::numeric(14,3);

alter table public.dabbir_expenses
  alter column amount_aed type numeric(14,3) using amount_aed::numeric(14,3);

alter table public.dabbir_financial_evidence
  alter column amount_aed type numeric(14,3) using amount_aed::numeric(14,3);

alter table public.dabbir_home_service_settings
  alter column default_visit_fee_aed type numeric(14,3) using default_visit_fee_aed::numeric(14,3);

alter table public.dabbir_operational_payments
  alter column amount_aed type numeric(14,3) using amount_aed::numeric(14,3);

alter table public.dabbir_order_items
  alter column unit_price_aed type numeric(14,3) using unit_price_aed::numeric(14,3),
  alter column line_total_aed type numeric(14,3) using line_total_aed::numeric(14,3);

alter table public.dabbir_order_returns
  alter column refund_aed type numeric(14,3) using refund_aed::numeric(14,3);

alter table public.dabbir_orders
  alter column total_aed type numeric(14,3) using total_aed::numeric(14,3),
  alter column paid_aed type numeric(14,3) using paid_aed::numeric(14,3);

alter table public.dabbir_products
  alter column price_aed type numeric(14,3) using price_aed::numeric(14,3);

alter table public.dabbir_services
  alter column price_aed type numeric(14,3) using price_aed::numeric(14,3);

alter table public.dabbir_worker_services
  alter column price_aed type numeric(14,3) using price_aed::numeric(14,3);

create trigger dabbir_operational_payment_status_sync
after insert or update of status, amount_aed on public.dabbir_operational_payments
for each row execute function dabbir_private.sync_appointment_payment_status();

create trigger zz_dabbir_deposit_auto_confirm
after insert or update of status, amount_aed on public.dabbir_operational_payments
for each row execute function dabbir_private.auto_confirm_paid_deposit();
