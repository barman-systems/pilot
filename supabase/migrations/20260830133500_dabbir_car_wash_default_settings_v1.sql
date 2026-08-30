begin;
insert into public.dabbir_car_wash_settings (business_id, public_booking_enabled, slot_interval_minutes, booking_horizon_days, open_time, close_time, working_days)
select id, true, 30, 14, '08:00', '20:00', array[0,1,2,3,4,5,6]::smallint[]
from public.dabbir_businesses
where business_type = 'car_wash'
on conflict (business_id) do nothing;
commit;
