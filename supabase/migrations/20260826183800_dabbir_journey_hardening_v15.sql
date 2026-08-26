-- DABBIR full-customer-journey hardening.
-- Production parity for handoff INSERT ACL, canonical follow-up lifecycle status,
-- and QA cleanup that respects designated-owner immutability.

grant insert on table public.dabbir_handoffs to authenticated;

create or replace function dabbir_private.normalize_followup_lifecycle_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status is not null then
    new.status := upper(trim(new.status));
  end if;
  return new;
end;
$$;

revoke all on function dabbir_private.normalize_followup_lifecycle_status() from public, anon, authenticated;

drop trigger if exists dabbir_followups_normalize_lifecycle_status on public.dabbir_followups;
create trigger dabbir_followups_normalize_lifecycle_status
before insert or update of status on public.dabbir_followups
for each row execute function dabbir_private.normalize_followup_lifecycle_status();

create or replace function public.dabbir_qa_cleanup_business(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_name text;
  v_owner_id uuid;
begin
  select b.name, b.owner_id into v_name, v_owner_id
  from public.dabbir_businesses as b
  where b.id = p_business_id;

  if not found then
    return jsonb_build_object('ok', true, 'deleted', false, 'reason', 'BUSINESS_NOT_FOUND');
  end if;

  if v_name not like 'DABBIR AI QA %' then
    raise exception 'QA_CLEANUP_SCOPE_DENIED' using errcode = '42501';
  end if;

  delete from public.dabbir_access_audit where business_id = p_business_id;
  delete from public.dabbir_privacy_audit where business_id = p_business_id;
  delete from public.dabbir_procedure_audit where business_id = p_business_id;
  delete from public.dabbir_message_batch_items where business_id = p_business_id;
  delete from public.dabbir_message_batches where business_id = p_business_id;
  delete from public.dabbir_quality_regression_cases where business_id = p_business_id;
  delete from public.dabbir_quality_events where business_id = p_business_id;
  delete from public.dabbir_quality_cases where business_id = p_business_id;
  delete from public.dabbir_customer_evidence where business_id = p_business_id;
  delete from public.dabbir_verification_challenges where business_id = p_business_id;
  delete from public.dabbir_customer_consents where business_id = p_business_id;
  delete from public.dabbir_privacy_requests where business_id = p_business_id;
  delete from public.dabbir_event_inbox where business_id = p_business_id;
  delete from public.dabbir_operation_outcomes where business_id = p_business_id;
  delete from public.dabbir_procedure_steps where business_id = p_business_id;
  delete from public.dabbir_procedure_runs where business_id = p_business_id;
  delete from public.dabbir_procedure_definitions where business_id = p_business_id;
  delete from public.dabbir_action_policies where business_id = p_business_id;
  delete from public.dabbir_conversation_outcomes where business_id = p_business_id;
  delete from public.dabbir_handoffs where business_id = p_business_id;
  delete from public.dabbir_followups where business_id = p_business_id;
  delete from public.dabbir_appointments where business_id = p_business_id;
  delete from public.dabbir_orders where business_id = p_business_id;
  delete from public.dabbir_inventory where business_id = p_business_id;
  delete from public.dabbir_products where business_id = p_business_id;
  delete from public.dabbir_services where business_id = p_business_id;
  delete from public.dabbir_messages where business_id = p_business_id;
  delete from public.dabbir_conversations where business_id = p_business_id;
  delete from public.dabbir_customer_memory where business_id = p_business_id;
  delete from public.dabbir_customer_management where business_id = p_business_id;
  delete from public.dabbir_customer_identities where business_id = p_business_id;
  delete from public.dabbir_business_knowledge where business_id = p_business_id;
  delete from public.dabbir_demo_events where business_id = p_business_id;
  delete from public.dabbir_employee_invitations where business_id = p_business_id;
  delete from public.dabbir_retention_policies where business_id = p_business_id;
  delete from public.dabbir_privacy_controls where business_id = p_business_id;
  delete from public.dabbir_channels where business_id = p_business_id;

  -- The designated owner membership is immutable while the parent business exists.
  -- Remove only non-owner memberships directly, then let parent deletion cascade the owner.
  delete from public.dabbir_memberships
  where business_id = p_business_id and role <> 'owner';
  delete from public.dabbir_businesses where id = p_business_id;

  return jsonb_build_object('ok', true, 'deleted', true, 'business_id', p_business_id, 'owner_id', v_owner_id);
end;
$$;

revoke all on function public.dabbir_qa_cleanup_business(uuid) from public, anon, authenticated;
grant execute on function public.dabbir_qa_cleanup_business(uuid) to service_role;
