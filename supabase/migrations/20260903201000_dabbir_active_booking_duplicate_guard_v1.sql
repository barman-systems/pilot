-- Fail closed against repeated active booking writes, including legacy writers
-- that have not yet supplied an explicit idempotency key.
create unique index if not exists dabbir_appointments_active_customer_slot_uq
  on public.dabbir_appointments(
    business_id,
    customer_id,
    (coalesce(service_id,'00000000-0000-0000-0000-000000000000'::uuid)),
    starts_at
  )
  where customer_id is not null
    and starts_at is not null
    and status not in ('cancelled','completed','no_show');
