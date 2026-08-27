-- DABBIR Owner Decision Memory hardening v2 (BAR-29)
-- Keep private implementation private; expose only guarded public SECURITY INVOKER RPC wrappers.

alter table public.dabbir_owner_decision_observations force row level security;
alter table public.dabbir_owner_policy_versions force row level security;
alter table public.dabbir_owner_policy_audit force row level security;

create or replace function public.dabbir_owner_policy_candidates(p_business_id uuid)
returns table(
  action_key text,
  decision_key text,
  decision_value text,
  match_bounds jsonb,
  observation_count bigint,
  last_observed_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from dabbir_private.dabbir_owner_policy_candidates(p_business_id);
$$;

create or replace function public.dabbir_activate_owner_policy(
  p_business_id uuid,
  p_action_key text,
  p_decision_key text,
  p_decision_value text,
  p_match_bounds jsonb,
  p_confirmation_source text
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select dabbir_private.dabbir_activate_owner_policy(
    p_business_id,p_action_key,p_decision_key,p_decision_value,p_match_bounds,p_confirmation_source
  );
$$;

create or replace function public.dabbir_set_owner_policy_state(
  p_business_id uuid,
  p_policy_id uuid,
  p_state text
)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select dabbir_private.dabbir_set_owner_policy_state(p_business_id,p_policy_id,p_state);
$$;

revoke all on function public.dabbir_owner_policy_candidates(uuid) from public, anon;
revoke all on function public.dabbir_activate_owner_policy(uuid,text,text,text,jsonb,text) from public, anon;
revoke all on function public.dabbir_set_owner_policy_state(uuid,uuid,text) from public, anon;
grant execute on function public.dabbir_owner_policy_candidates(uuid) to authenticated;
grant execute on function public.dabbir_activate_owner_policy(uuid,text,text,text,jsonb,text) to authenticated;
grant execute on function public.dabbir_set_owner_policy_state(uuid,uuid,text) to authenticated;

-- Internal-only helpers are not exposed as public RPCs.
revoke all on function dabbir_private.dabbir_owner_memory_sensitive_action(text) from public, anon, authenticated;
grant execute on function dabbir_private.dabbir_owner_memory_sensitive_action(text) to service_role;

comment on function public.dabbir_owner_policy_candidates(uuid) is 'Authenticated owner-facing RPC wrapper; authorization remains enforced by private implementation.';
comment on function public.dabbir_activate_owner_policy(uuid,text,text,text,jsonb,text) is 'Authenticated explicit-owner activation wrapper for BAR-29 LOW-risk policy memory.';
comment on function public.dabbir_set_owner_policy_state(uuid,uuid,text) is 'Authenticated explicit-owner pause/resume/revoke wrapper for BAR-29 policy memory.';
