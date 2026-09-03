-- Public booking remains anonymous at the DABBIR web endpoint, while privileged
-- booking RPCs are callable only by the server-side service role.
revoke execute on function public.dabbir_public_car_wash_catalog(text) from anon, authenticated;
revoke execute on function public.dabbir_public_car_wash_slots(text, uuid, date, date) from anon, authenticated;
revoke execute on function public.dabbir_public_car_wash_book(text, uuid, text, timestamptz, text, text, numeric, numeric, text) from anon, authenticated;

grant execute on function public.dabbir_public_car_wash_catalog(text) to service_role;
grant execute on function public.dabbir_public_car_wash_slots(text, uuid, date, date) to service_role;
grant execute on function public.dabbir_public_car_wash_book(text, uuid, text, timestamptz, text, text, numeric, numeric, text) to service_role;
