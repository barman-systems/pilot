-- Remove only exact duplicate car-wash indexes introduced by concurrent hardening.
-- Canonical full covering indexes created by dabbir_car_wash_security_performance_v1 remain.

drop index if exists public.dabbir_car_wash_photos_business_fk_idx;
drop index if exists public.dabbir_car_wash_history_business_fk_idx;
drop index if exists public.dabbir_car_wash_recurring_offer_fk_idx;
drop index if exists public.dabbir_car_wash_recurring_vehicle_fk_idx;
