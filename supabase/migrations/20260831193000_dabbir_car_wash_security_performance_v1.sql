begin;

-- Cover foreign keys used by joins, deletes and tenant-scoped operational reads.
create index if not exists dabbir_car_wash_booking_photos_business_idx
  on public.dabbir_car_wash_booking_photos(business_id);
create index if not exists dabbir_car_wash_booking_photos_created_by_idx
  on public.dabbir_car_wash_booking_photos(created_by)
  where created_by is not null;
create index if not exists dabbir_car_wash_booking_photos_vehicle_idx
  on public.dabbir_car_wash_booking_photos(vehicle_id)
  where vehicle_id is not null;

create index if not exists dabbir_car_wash_booking_customer_fk_idx
  on public.dabbir_car_wash_booking_requests(business_id, customer_id)
  where customer_id is not null;
create index if not exists dabbir_car_wash_booking_vehicle_fk_idx
  on public.dabbir_car_wash_booking_requests(vehicle_id)
  where vehicle_id is not null;

create index if not exists dabbir_car_wash_history_business_idx
  on public.dabbir_car_wash_booking_status_history(business_id);
create index if not exists dabbir_car_wash_history_changed_by_idx
  on public.dabbir_car_wash_booking_status_history(changed_by)
  where changed_by is not null;

create index if not exists dabbir_car_wash_recurring_customer_fk_idx
  on public.dabbir_car_wash_recurring_plans(business_id, customer_id);
create index if not exists dabbir_car_wash_recurring_offer_idx
  on public.dabbir_car_wash_recurring_plans(offer_id);
create index if not exists dabbir_car_wash_recurring_vehicle_idx
  on public.dabbir_car_wash_recurring_plans(vehicle_id);

-- Evaluate auth.uid() once per statement instead of once per candidate row.
drop policy if exists dabbir_car_wash_booking_operations_update on public.dabbir_car_wash_booking_requests;
create policy dabbir_car_wash_booking_operations_update
on public.dabbir_car_wash_booking_requests
for update to authenticated
using (
  exists (
    select 1 from public.dabbir_memberships m
    where m.business_id = dabbir_car_wash_booking_requests.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin','manager','employee','staff')
  )
)
with check (
  exists (
    select 1 from public.dabbir_memberships m
    where m.business_id = dabbir_car_wash_booking_requests.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin','manager','employee','staff')
  )
);

drop policy if exists dabbir_car_wash_vehicles_member on public.dabbir_car_wash_vehicles;
create policy dabbir_car_wash_vehicles_member
on public.dabbir_car_wash_vehicles
for all to authenticated
using (
  exists (
    select 1 from public.dabbir_memberships m
    where m.business_id = dabbir_car_wash_vehicles.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin','manager','employee','staff')
  )
)
with check (
  exists (
    select 1 from public.dabbir_memberships m
    where m.business_id = dabbir_car_wash_vehicles.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin','manager','employee','staff')
  )
);

drop policy if exists dabbir_car_wash_history_member on public.dabbir_car_wash_booking_status_history;
create policy dabbir_car_wash_history_member
on public.dabbir_car_wash_booking_status_history
for select to authenticated
using (
  exists (
    select 1 from public.dabbir_memberships m
    where m.business_id = dabbir_car_wash_booking_status_history.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin','manager','employee','staff')
  )
);

drop policy if exists dabbir_car_wash_history_write on public.dabbir_car_wash_booking_status_history;
create policy dabbir_car_wash_history_write
on public.dabbir_car_wash_booking_status_history
for insert to authenticated
with check (
  exists (
    select 1 from public.dabbir_memberships m
    where m.business_id = dabbir_car_wash_booking_status_history.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin','manager','employee','staff')
  )
);

drop policy if exists dabbir_car_wash_photos_member on public.dabbir_car_wash_booking_photos;
create policy dabbir_car_wash_photos_member
on public.dabbir_car_wash_booking_photos
for all to authenticated
using (
  exists (
    select 1 from public.dabbir_memberships m
    where m.business_id = dabbir_car_wash_booking_photos.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin','manager','employee','staff')
  )
)
with check (
  exists (
    select 1 from public.dabbir_memberships m
    where m.business_id = dabbir_car_wash_booking_photos.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin','manager','employee','staff')
  )
);

drop policy if exists dabbir_car_wash_recurring_member on public.dabbir_car_wash_recurring_plans;
create policy dabbir_car_wash_recurring_member
on public.dabbir_car_wash_recurring_plans
for all to authenticated
using (
  exists (
    select 1 from public.dabbir_memberships m
    where m.business_id = dabbir_car_wash_recurring_plans.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin','manager','employee','staff')
  )
)
with check (
  exists (
    select 1 from public.dabbir_memberships m
    where m.business_id = dabbir_car_wash_recurring_plans.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin','manager','employee','staff')
  )
);

-- Public booking is intentionally anonymous. Signed-in users do not need direct
-- EXECUTE because DABBIR's public booking API calls these RPCs with the anon key.
revoke execute on function public.dabbir_public_car_wash_book(text, uuid, text, timestamptz, text, text, numeric, numeric, text) from authenticated;
revoke execute on function public.dabbir_public_car_wash_catalog(text) from authenticated;
revoke execute on function public.dabbir_public_car_wash_slots(text, uuid, date, date) from authenticated;

commit;
