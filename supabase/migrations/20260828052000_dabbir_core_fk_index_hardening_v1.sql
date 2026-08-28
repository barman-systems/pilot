-- DABBIR core FK index hardening.
-- Scope is deliberately limited to DABBIR-owned tables reported by the live
-- Supabase performance advisor. This migration is additive only: no data,
-- privilege, policy, or RLS changes.

-- Recovery / account access.
create index if not exists recovery_restore_events_journal_event_idx
  on dabbir_private.recovery_restore_events(journal_event_id);
create index if not exists recovery_runtime_context_recovery_case_idx
  on dabbir_private.recovery_runtime_context(recovery_case_id);
create index if not exists account_access_state_reinstated_by_idx
  on public.account_access_state(reinstated_by);
create index if not exists account_access_state_suspended_by_idx
  on public.account_access_state(suspended_by);

-- Access and invitation audit paths.
create index if not exists dabbir_access_audit_actor_user_idx
  on public.dabbir_access_audit(actor_user_id);
create index if not exists dabbir_access_audit_invitation_idx
  on public.dabbir_access_audit(invitation_id);
create index if not exists dabbir_access_audit_target_user_idx
  on public.dabbir_access_audit(target_user_id);
create index if not exists dabbir_employee_invitations_accepted_by_idx
  on public.dabbir_employee_invitations(accepted_by);
create index if not exists dabbir_employee_invitations_invited_by_idx
  on public.dabbir_employee_invitations(invited_by);
create index if not exists dabbir_memberships_invited_by_idx
  on public.dabbir_memberships(invited_by);

-- Conversation/event runtime paths.
create index if not exists dabbir_conversation_outcomes_conversation_idx
  on public.dabbir_conversation_outcomes(conversation_id);
create index if not exists dabbir_conversation_outcomes_customer_idx
  on public.dabbir_conversation_outcomes(customer_id);
create index if not exists dabbir_customer_evidence_conversation_fk_idx
  on public.dabbir_customer_evidence(conversation_id);
create index if not exists dabbir_customer_evidence_customer_fk_idx
  on public.dabbir_customer_evidence(customer_id);
create index if not exists dabbir_customer_evidence_message_fk_idx
  on public.dabbir_customer_evidence(message_id);
create index if not exists dabbir_event_inbox_customer_fk_idx
  on public.dabbir_event_inbox(customer_id);
create index if not exists dabbir_followups_conversation_fk_idx
  on public.dabbir_followups(conversation_id);
create index if not exists dabbir_handoffs_assigned_user_idx
  on public.dabbir_handoffs(assigned_user_id);
create index if not exists dabbir_messages_sender_user_fk_idx
  on public.dabbir_messages(sender_user_id);

-- Message batching.
create index if not exists dabbir_message_batch_items_message_idx
  on public.dabbir_message_batch_items(message_id);
create index if not exists dabbir_message_batches_conversation_idx
  on public.dabbir_message_batches(conversation_id);
create index if not exists dabbir_message_batches_customer_idx
  on public.dabbir_message_batches(customer_id);

-- Owner memory/policy and privacy evidence.
create index if not exists dabbir_owner_decision_observations_owner_user_idx
  on public.dabbir_owner_decision_observations(owner_user_id);
create index if not exists dabbir_owner_policy_audit_actor_user_idx
  on public.dabbir_owner_policy_audit(actor_user_id);
create index if not exists dabbir_owner_policy_audit_policy_idx
  on public.dabbir_owner_policy_audit(policy_id);
create index if not exists dabbir_owner_policy_versions_owner_user_idx
  on public.dabbir_owner_policy_versions(owner_user_id);
create index if not exists dabbir_privacy_audit_request_idx
  on public.dabbir_privacy_audit(privacy_request_id);

-- Procedure execution and quality evidence.
create index if not exists dabbir_procedure_audit_business_idx
  on public.dabbir_procedure_audit(business_id);
create index if not exists dabbir_procedure_audit_step_idx
  on public.dabbir_procedure_audit(step_id);
create index if not exists dabbir_procedure_definitions_created_by_idx
  on public.dabbir_procedure_definitions(created_by);
create index if not exists dabbir_procedure_runs_owner_approved_by_idx
  on public.dabbir_procedure_runs(owner_approved_by);
create index if not exists dabbir_quality_events_conversation_idx
  on public.dabbir_quality_events(conversation_id);
create index if not exists dabbir_quality_regression_cases_business_idx
  on public.dabbir_quality_regression_cases(business_id);
create index if not exists dabbir_retention_policies_data_category_idx
  on public.dabbir_retention_policies(data_category);

-- Verification / identity challenge paths.
create index if not exists dabbir_verification_challenges_customer_fk_idx
  on public.dabbir_verification_challenges(customer_id);
create index if not exists dabbir_verification_challenges_identity_idx
  on public.dabbir_verification_challenges(identity_id);
