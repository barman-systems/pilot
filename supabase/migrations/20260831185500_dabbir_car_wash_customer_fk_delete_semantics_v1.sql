begin;

alter table public.dabbir_car_wash_booking_requests
  drop constraint if exists dabbir_car_wash_booking_customer_fk;

alter table public.dabbir_car_wash_booking_requests
  add constraint dabbir_car_wash_booking_customer_fk
  foreign key (business_id, customer_id)
  references public.dabbir_customers(business_id, id)
  on delete set null (customer_id);

commit;
