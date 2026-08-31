-- DABBIR car-wash database stabilization.
-- Keeps the existing tenant/role authorization semantics while avoiding
-- per-row auth.uid() re-evaluation and covering all car-wash foreign keys.

-- RLS policy init-plan optimization: cache auth.uid() once per statement.
drop policy if exists dabbir_car_wash_booking_operations_update on public.dabbir_car_wash_booking_requests;
create policy dabbir_car_wash_booking_operations_update on public.dabbir_car_wash_booking_requests
for update to authenticated
using (
  exists (
    select 1
    from public.dabbir_memberships m
    where m.business_id = dabbir_car_wash_booking_requests.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin','manager','employee','staff')
  )
)
with check (
  exists (
    select 1
    from public.dabbir_memberships m
    where m.business_id = dabbir_car_wash_booking_requests.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin','manager','employee','staff')
  )
);

drop policy if exists dabbir_car_wash_vehicles_member on public.dabbir_car_wash_vehicles;
create policy dabbir_car_wash_vehicles_member on public.dabbir_car_wash_vehicles
for all to authenticated
using (
  exists (
    select 1
    from public.dabbir_memberships m
    where m.business_id = dabbir_car_wash_vehicles.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin','manager','employee','staff')
  )
)
with check (
  exists (
    select 1
    from public.dabbir_memberships m
    where m.business_id = dabbir_car_wash_vehicles.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin','manager','employee','staff')
  )
);

drop policy if exists dabbir_car_wash_history_member on public.dabbir_car_wash_booking_status_history;
create policy dabbir_car_wash_history_member on public.dabbir_car_wash_booking_status_history
for select to authenticated
using (
  exists (
    select 1
    from public.dabbir_memberships m
    where m.business_id = dabbir_car_wash_booking_status_history.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin','manager','employee','staff')
  )
);

drop policy if exists dabbir_car_wash_history_write on public.dabbir_car_wash_booking_status_history;
create policy dabbir_car_wash_history_write on public.dabbir_car_wash_booking_status_history
for insert to authenticated
with check (
  exists (
    select 1
    from public.dabbir_memberships m
    where m.business_id = dabbir_car_wash_booking_status_history.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin','manager','employee','staff')
  )
);

drop policy if exists dabbir_car_wash_photos_member on public.dabbir_car_wash_booking_photos;
create policy dabbir_car_wash_photos_member on public.dabbir_car_wash_booking_photos
for all to authenticated
using (
  exists (
    select 1
    from public.dabbir_memberships m
    where m.business_id = dabbir_car_wash_booking_photos.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin','manager','employee','staff')
  )
)
with check (
  exists (
    select 1
    from public.dabbir_memberships m
    where m.business_id = dabbir_car_wash_booking_photos.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin','manager','employee','staff')
  )
);

drop policy if exists dabbir_car_wash_recurring_member on public.dabbir_car_wash_recurring_plans;
create policy dabbir_car_wash_recurring_member on public.dabbir_car_wash_recurring_plans
for all to authenticated
using (
  exists (
    select 1
    from public.dabbir_memberships m
    where m.business_id = dabbir_car_wash_recurring_plans.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin','manager','employee','staff')
  )
)
with check (
  exists (
    select 1
    from public.dabbir_memberships m
    where m.business_id = dabbir_car_wash_recurring_plans.business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin','manager','employee','staff')
  )
);

-- Cover foreign-key lookup paths used by cascades, joins, and tenant operations.
create index if not exists dabbir_car_wash_booking_requests_customer_fk_idx
  on public.dabbir_car_wash_booking_requests (business_id, customer_id);
create index if not exists dabbir_car_wash_booking_requests_vehicle_fk_idx
  on public.dabbir_car_wash_booking_requests (vehicle_id);

create index if not exists dabbir_car_wash_history_business_fk_idx
  on public.dabbir_car_wash_booking_status_history (business_id);
create index if not exists dabbir_car_wash_history_changed_by_fk_idx
  on public.dabbir_car_wash_booking_status_history (changed_by);

create index if not exists dabbir_car_wash_photos_business_fk_idx
  on public.dabbir_car_wash_booking_photos (business_id);
create index if not exists dabbir_car_wash_photos_vehicle_fk_idx
  on public.dabbir_car_wash_booking_photos (vehicle_id);
create index if not exists dabbir_car_wash_photos_created_by_fk_idx
  on public.dabbir_car_wash_booking_photos (created_by);

create index if not exists dabbir_car_wash_recurring_customer_fk_idx
  on public.dabbir_car_wash_recurring_plans (business_id, customer_id);
create index if not exists dabbir_car_wash_recurring_vehicle_fk_idx
  on public.dabbir_car_wash_recurring_plans (vehicle_id);
create index if not exists dabbir_car_wash_recurring_offer_fk_idx
  on public.dabbir_car_wash_recurring_plans (offer_id);
