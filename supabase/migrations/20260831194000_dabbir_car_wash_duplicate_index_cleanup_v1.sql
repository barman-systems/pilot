begin;

-- Retain the canonical *_fk_idx indexes already present for these exact key shapes.
drop index if exists public.dabbir_car_wash_booking_photos_business_idx;
drop index if exists public.dabbir_car_wash_history_business_idx;
drop index if exists public.dabbir_car_wash_recurring_offer_idx;
drop index if exists public.dabbir_car_wash_recurring_vehicle_idx;

commit;
