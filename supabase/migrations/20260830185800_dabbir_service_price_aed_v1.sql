-- Add a deterministic AED value to every DABBIR service.
-- Existing services remain valid at 0 AED until the owner enters their actual value.

alter table public.dabbir_services
  add column if not exists price_aed numeric(12,2) not null default 0;

alter table public.dabbir_services
  drop constraint if exists dabbir_services_price_aed_check;

alter table public.dabbir_services
  add constraint dabbir_services_price_aed_check
  check (price_aed >= 0 and price_aed <= 10000000);
