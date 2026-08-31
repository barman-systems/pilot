-- DABBIR latency hardening: FK indexes, duplicate-index cleanup, and RLS SELECT de-duplication.

create index if not exists dabbir_appointment_services_business_service_idx
  on public.dabbir_appointment_services (business_id, service_id);
create index if not exists dabbir_commissions_business_appointment_idx
  on public.dabbir_commissions (business_id, appointment_id);
create index if not exists dabbir_customer_notes_created_by_idx
  on public.dabbir_customer_notes (created_by);
create index if not exists dabbir_operational_payments_recorded_by_idx
  on public.dabbir_operational_payments (recorded_by);
create index if not exists dabbir_waitlist_business_customer_idx
  on public.dabbir_waitlist_entries (business_id, customer_id);
create index if not exists dabbir_waitlist_business_preferred_worker_idx
  on public.dabbir_waitlist_entries (business_id, preferred_worker_id);
create index if not exists dabbir_waitlist_matched_appointment_idx
  on public.dabbir_waitlist_entries (matched_appointment_id);
create index if not exists dabbir_worker_services_business_worker_idx
  on public.dabbir_worker_services (business_id, worker_id);
create index if not exists dabbir_workers_membership_user_idx
  on public.dabbir_workers (membership_user_id);
create index if not exists dabbir_workflow_audit_actor_user_idx
  on public.dabbir_workflow_audit (actor_user_id);
create index if not exists dabbir_workflow_notifications_customer_idx
  on public.dabbir_workflow_notifications (customer_id);
create index if not exists dabbir_workflow_notifications_waitlist_idx
  on public.dabbir_workflow_notifications (waitlist_entry_id);
create index if not exists dabbir_workflow_notifications_appointment_fk_idx
  on public.dabbir_workflow_notifications (appointment_id);
create index if not exists dabbir_workflow_status_history_actor_user_idx
  on public.dabbir_workflow_status_history (actor_user_id);
create index if not exists dabbir_workflow_status_history_appointment_fk_idx
  on public.dabbir_workflow_status_history (appointment_id);

drop index if exists public.dabbir_conversations_business_updated_idx;

-- The former ALL policies duplicated SELECT evaluation with the explicit read
-- policies. Split them into write-only policies so reads evaluate one path.
do $$
declare r record;
begin
  for r in select * from (values
    ('dabbir_appointment_services','dabbir_appointment_services_write','dabbir_private.salon_member_scope(business_id, worker_id, true)'),
    ('dabbir_customer_notes','dabbir_customer_notes_write','dabbir_private.salon_customer_scope(business_id, customer_id, true)'),
    ('dabbir_salon_settings','dabbir_salon_settings_write','dabbir_private.has_permission(business_id, ''manage_business''::text)'),
    ('dabbir_waitlist_entries','dabbir_waitlist_write','dabbir_private.salon_customer_scope(business_id, customer_id, true)'),
    ('dabbir_worker_schedules','dabbir_worker_schedules_write','dabbir_private.has_permission(business_id, ''manage_team''::text)'),
    ('dabbir_worker_services','dabbir_worker_services_write','dabbir_private.has_permission(business_id, ''manage_team''::text)'),
    ('dabbir_worker_time_off','dabbir_worker_time_off_write','dabbir_private.has_permission(business_id, ''manage_team''::text)')
  ) as v(tablename, old_policy, predicate)
  loop
    execute format('drop policy if exists %I on public.%I', r.old_policy, r.tablename);
    execute format('drop policy if exists %I_insert on public.%I', r.old_policy, r.tablename);
    execute format('drop policy if exists %I_update on public.%I', r.old_policy, r.tablename);
    execute format('drop policy if exists %I_delete on public.%I', r.old_policy, r.tablename);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (%s)', r.old_policy, r.tablename, r.predicate);
    execute format('create policy %I_update on public.%I for update to authenticated using (%s) with check (%s)', r.old_policy, r.tablename, r.predicate, r.predicate);
    execute format('create policy %I_delete on public.%I for delete to authenticated using (%s)', r.old_policy, r.tablename, r.predicate);
  end loop;
end $$;
