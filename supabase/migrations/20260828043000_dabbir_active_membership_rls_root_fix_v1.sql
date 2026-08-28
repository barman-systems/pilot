-- DABBIR root-cause hardening: every tenant RLS path that reads memberships
-- directly must fail closed for suspended/removed memberships and globally
-- suspended accounts. Keep this logic in one helper so future policies do not
-- drift from the canonical access semantics in has_permission().

create or replace function dabbir_private.is_active_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select dabbir_private.account_active()
    and (select auth.uid()) is not null
    and exists (
      select 1
      from public.dabbir_memberships m
      where m.business_id = p_business_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
        and m.suspended_at is null
        and m.removed_at is null
    );
$$;

revoke all on function dabbir_private.is_active_member(uuid) from public, anon;
grant execute on function dabbir_private.is_active_member(uuid) to authenticated, service_role;

-- General tenant-member reads/writes: require a currently active membership.
alter policy dabbir_conversation_outcomes_member_select on public.dabbir_conversation_outcomes
  using (dabbir_private.is_active_member(business_id));
alter policy dabbir_customer_evidence_member_select on public.dabbir_customer_evidence
  using (dabbir_private.is_active_member(business_id));
alter policy dabbir_customer_identities_member_select on public.dabbir_customer_identities
  using (dabbir_private.is_active_member(business_id));
alter policy dabbir_demo_events_member_all on public.dabbir_demo_events
  using (dabbir_private.is_active_member(business_id))
  with check (dabbir_private.is_active_member(business_id));
alter policy dabbir_event_inbox_member_select on public.dabbir_event_inbox
  using (dabbir_private.is_active_member(business_id));
alter policy dabbir_inventory_member_all on public.dabbir_inventory
  using (dabbir_private.is_active_member(business_id))
  with check (dabbir_private.is_active_member(business_id));
alter policy dabbir_message_batch_items_member_select on public.dabbir_message_batch_items
  using (dabbir_private.is_active_member(business_id));
alter policy dabbir_message_batches_member_select on public.dabbir_message_batches
  using (dabbir_private.is_active_member(business_id));
alter policy dabbir_orders_member_all on public.dabbir_orders
  using (dabbir_private.is_active_member(business_id))
  with check (dabbir_private.is_active_member(business_id));
alter policy dabbir_procedure_audit_member_select on public.dabbir_procedure_audit
  using (dabbir_private.is_active_member(business_id));
alter policy dabbir_procedure_runs_member_select on public.dabbir_procedure_runs
  using (dabbir_private.is_active_member(business_id));
alter policy dabbir_procedure_steps_member_select on public.dabbir_procedure_steps
  using (dabbir_private.is_active_member(business_id));
alter policy dabbir_products_member_all on public.dabbir_products
  using (dabbir_private.is_active_member(business_id))
  with check (dabbir_private.is_active_member(business_id));
alter policy dabbir_quality_cases_member_select on public.dabbir_quality_cases
  using (dabbir_private.is_active_member(business_id));
alter policy dabbir_quality_events_member_select on public.dabbir_quality_events
  using (dabbir_private.is_active_member(business_id));
alter policy dabbir_quality_regression_member_select on public.dabbir_quality_regression_cases
  using (dabbir_private.is_active_member(business_id));
alter policy dabbir_tasks_select on public.dabbir_tasks
  using (dabbir_private.is_active_member(business_id));

-- Owner/admin policies had their own role checks but did not consistently apply
-- global account suspension plus membership suspended_at/removed_at semantics.
alter policy dabbir_billing_accounts_owner_select on public.dabbir_billing_accounts
  using (
    dabbir_private.is_active_member(business_id)
    and exists (
      select 1 from public.dabbir_memberships m
      where m.business_id = dabbir_billing_accounts.business_id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
    )
  );

alter policy dabbir_cash_guardian_settings_owner_insert on public.dabbir_cash_guardian_settings
  with check (
    dabbir_private.is_active_member(business_id)
    and exists (
      select 1 from public.dabbir_memberships m
      where m.business_id = dabbir_cash_guardian_settings.business_id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
    )
    and updated_by = (select auth.uid())
  );
alter policy dabbir_cash_guardian_settings_owner_select on public.dabbir_cash_guardian_settings
  using (
    dabbir_private.is_active_member(business_id)
    and exists (
      select 1 from public.dabbir_memberships m
      where m.business_id = dabbir_cash_guardian_settings.business_id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
    )
  );
alter policy dabbir_cash_guardian_settings_owner_update on public.dabbir_cash_guardian_settings
  using (
    dabbir_private.is_active_member(business_id)
    and exists (
      select 1 from public.dabbir_memberships m
      where m.business_id = dabbir_cash_guardian_settings.business_id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
    )
  )
  with check (
    dabbir_private.is_active_member(business_id)
    and exists (
      select 1 from public.dabbir_memberships m
      where m.business_id = dabbir_cash_guardian_settings.business_id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
    )
    and updated_by = (select auth.uid())
  );

alter policy dabbir_financial_coverage_owner_attest on public.dabbir_financial_coverage
  with check (
    dabbir_private.is_active_member(business_id)
    and exists (
      select 1 from public.dabbir_memberships m
      where m.business_id = dabbir_financial_coverage.business_id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
    )
    and source_kind = 'owner_attested'
    and created_by = (select auth.uid())
    and verified_by = (select auth.uid())
  );
alter policy dabbir_financial_coverage_owner_select on public.dabbir_financial_coverage
  using (
    dabbir_private.is_active_member(business_id)
    and exists (
      select 1 from public.dabbir_memberships m
      where m.business_id = dabbir_financial_coverage.business_id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
    )
  );
alter policy dabbir_financial_evidence_owner_attest on public.dabbir_financial_evidence
  with check (
    dabbir_private.is_active_member(business_id)
    and exists (
      select 1 from public.dabbir_memberships m
      where m.business_id = dabbir_financial_evidence.business_id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
    )
    and source_kind = 'owner_attested'
    and created_by = (select auth.uid())
    and verified_by = (select auth.uid())
  );
alter policy dabbir_financial_evidence_owner_select on public.dabbir_financial_evidence
  using (
    dabbir_private.is_active_member(business_id)
    and exists (
      select 1 from public.dabbir_memberships m
      where m.business_id = dabbir_financial_evidence.business_id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
    )
  );

alter policy dabbir_owner_decision_observations_owner_select on public.dabbir_owner_decision_observations
  using (
    dabbir_private.is_active_member(business_id)
    and exists (
      select 1 from public.dabbir_memberships m
      where m.business_id = dabbir_owner_decision_observations.business_id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
    )
  );
alter policy dabbir_owner_modes_owner_insert on public.dabbir_owner_modes
  with check (
    dabbir_private.is_active_member(business_id)
    and exists (
      select 1 from public.dabbir_memberships m
      where m.business_id = dabbir_owner_modes.business_id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
    )
    and updated_by = (select auth.uid())
  );
alter policy dabbir_owner_modes_owner_update on public.dabbir_owner_modes
  using (
    dabbir_private.is_active_member(business_id)
    and exists (
      select 1 from public.dabbir_memberships m
      where m.business_id = dabbir_owner_modes.business_id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
    )
  )
  with check (
    dabbir_private.is_active_member(business_id)
    and exists (
      select 1 from public.dabbir_memberships m
      where m.business_id = dabbir_owner_modes.business_id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
    )
    and updated_by = (select auth.uid())
  );
alter policy dabbir_owner_policy_audit_owner_select on public.dabbir_owner_policy_audit
  using (
    dabbir_private.is_active_member(business_id)
    and exists (
      select 1 from public.dabbir_memberships m
      where m.business_id = dabbir_owner_policy_audit.business_id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
    )
  );
alter policy dabbir_owner_policy_versions_owner_select on public.dabbir_owner_policy_versions
  using (
    dabbir_private.is_active_member(business_id)
    and exists (
      select 1 from public.dabbir_memberships m
      where m.business_id = dabbir_owner_policy_versions.business_id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
    )
  );

alter policy dabbir_whatsapp_connections_owner_delete on public.dabbir_whatsapp_connections
  using (
    dabbir_private.is_active_member(business_id)
    and exists (
      select 1 from public.dabbir_memberships m
      where m.business_id = dabbir_whatsapp_connections.business_id
        and m.user_id = (select auth.uid())
        and m.role = any (array['owner'::text,'admin'::text])
    )
  );
alter policy dabbir_whatsapp_connections_owner_insert on public.dabbir_whatsapp_connections
  with check (
    dabbir_private.is_active_member(business_id)
    and connected_by = (select auth.uid())
    and exists (
      select 1 from public.dabbir_memberships m
      where m.business_id = dabbir_whatsapp_connections.business_id
        and m.user_id = (select auth.uid())
        and m.role = any (array['owner'::text,'admin'::text])
    )
  );
alter policy dabbir_whatsapp_connections_owner_select on public.dabbir_whatsapp_connections
  using (
    dabbir_private.is_active_member(business_id)
    and exists (
      select 1 from public.dabbir_memberships m
      where m.business_id = dabbir_whatsapp_connections.business_id
        and m.user_id = (select auth.uid())
        and m.role = any (array['owner'::text,'admin'::text])
    )
  );
alter policy dabbir_whatsapp_connections_owner_update on public.dabbir_whatsapp_connections
  using (
    dabbir_private.is_active_member(business_id)
    and exists (
      select 1 from public.dabbir_memberships m
      where m.business_id = dabbir_whatsapp_connections.business_id
        and m.user_id = (select auth.uid())
        and m.role = any (array['owner'::text,'admin'::text])
    )
  )
  with check (
    dabbir_private.is_active_member(business_id)
    and exists (
      select 1 from public.dabbir_memberships m
      where m.business_id = dabbir_whatsapp_connections.business_id
        and m.user_id = (select auth.uid())
        and m.role = any (array['owner'::text,'admin'::text])
    )
  );

-- A globally suspended platform admin must not retain even self-read access.
alter policy dabbir_platform_admins_select_self on public.dabbir_platform_admins
  using (dabbir_private.account_active() and user_id = (select auth.uid()));
