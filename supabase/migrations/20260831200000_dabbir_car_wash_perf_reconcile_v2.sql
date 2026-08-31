begin;

-- Reconcile a concurrent live hardening migration with the repository source of truth.
-- Keep one canonical full index for each exact FK shape that needs full coverage.
create index if not exists dabbir_car_wash_photos_business_fk_idx
  on public.dabbir_car_wash_booking_photos (business_id);
create index if not exists dabbir_car_wash_history_business_fk_idx
  on public.dabbir_car_wash_booking_status_history (business_id);
create index if not exists dabbir_car_wash_recurring_offer_fk_idx
  on public.dabbir_car_wash_recurring_plans (offer_id);
create index if not exists dabbir_car_wash_recurring_vehicle_fk_idx
  on public.dabbir_car_wash_recurring_plans (vehicle_id);

-- Remove only exact full-index aliases created by the concurrent migration.
drop index if exists public.dabbir_car_wash_booking_photos_business_idx;
drop index if exists public.dabbir_car_wash_history_business_idx;
drop index if exists public.dabbir_car_wash_recurring_offer_idx;
drop index if exists public.dabbir_car_wash_recurring_vehicle_idx;

-- Public booking remains intentionally anonymous. Authenticated application users
-- go through DABBIR's protected APIs and do not need direct EXECUTE on these RPCs.
revoke execute on function public.dabbir_public_car_wash_book(text, uuid, text, timestamptz, text, text, numeric, numeric, text) from authenticated;
revoke execute on function public.dabbir_public_car_wash_catalog(text) from authenticated;
revoke execute on function public.dabbir_public_car_wash_slots(text, uuid, date, date) from authenticated;

commit;
