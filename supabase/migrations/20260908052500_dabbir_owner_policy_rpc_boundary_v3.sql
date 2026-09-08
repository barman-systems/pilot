-- The invoker wrappers could not call the deliberately private implementations.
-- Keep those implementations inaccessible to clients. Authorize at the public
-- boundary before entering the definer context; auth.uid() remains the JWT user.
create or replace function public.dabbir_owner_policy_candidates(p_business_id uuid)
returns table(action_key text,decision_key text,decision_value text,match_bounds jsonb,observation_count bigint,last_observed_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if not coalesce(dabbir_private.is_active_member(p_business_id),false) or
     not exists(select 1 from public.dabbir_memberships m where m.business_id=p_business_id and m.user_id=auth.uid() and m.role='owner' and m.status='active') then
    raise exception 'OWNER_REQUIRED';
  end if;
  return query select * from dabbir_private.dabbir_owner_policy_candidates(p_business_id);
end $$;

create or replace function public.dabbir_activate_owner_policy(p_business_id uuid,p_action_key text,p_decision_key text,p_decision_value text,p_match_bounds jsonb,p_confirmation_source text)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  if not coalesce(dabbir_private.is_active_member(p_business_id),false) or
     not exists(select 1 from public.dabbir_memberships m where m.business_id=p_business_id and m.user_id=auth.uid() and m.role='owner' and m.status='active') then
    raise exception 'OWNER_REQUIRED';
  end if;
  -- Serialize version allocation and state changes for the same tenant.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('owner-policy:'||p_business_id::text,0));
  return dabbir_private.dabbir_activate_owner_policy(p_business_id,p_action_key,p_decision_key,p_decision_value,p_match_bounds,p_confirmation_source);
end $$;

create or replace function public.dabbir_set_owner_policy_state(p_business_id uuid,p_policy_id uuid,p_state text)
returns text language plpgsql security definer set search_path='' as $$
begin
  if not coalesce(dabbir_private.is_active_member(p_business_id),false) or
     not exists(select 1 from public.dabbir_memberships m where m.business_id=p_business_id and m.user_id=auth.uid() and m.role='owner' and m.status='active') then
    raise exception 'OWNER_REQUIRED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('owner-policy:'||p_business_id::text,0));
  return dabbir_private.dabbir_set_owner_policy_state(p_business_id,p_policy_id,p_state);
end $$;

revoke all on function public.dabbir_owner_policy_candidates(uuid) from public,anon,authenticated;
revoke all on function public.dabbir_activate_owner_policy(uuid,text,text,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.dabbir_set_owner_policy_state(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.dabbir_owner_policy_candidates(uuid) to authenticated;
grant execute on function public.dabbir_activate_owner_policy(uuid,text,text,text,jsonb,text) to authenticated;
grant execute on function public.dabbir_set_owner_policy_state(uuid,uuid,text) to authenticated;

revoke all on function dabbir_private.dabbir_owner_policy_candidates(uuid) from public,anon,authenticated;
revoke all on function dabbir_private.dabbir_activate_owner_policy(uuid,text,text,text,jsonb,text) from public,anon,authenticated;
revoke all on function dabbir_private.dabbir_set_owner_policy_state(uuid,uuid,text) from public,anon,authenticated;

comment on function public.dabbir_owner_policy_candidates(uuid) is 'Active-account owner-only read boundary; private implementation remains inaccessible to clients.';
comment on function public.dabbir_activate_owner_policy(uuid,text,text,text,jsonb,text) is 'Active-account owner-only explicit LOW-risk policy activation; serialized per tenant.';
comment on function public.dabbir_set_owner_policy_state(uuid,uuid,text) is 'Active-account owner-only policy transition; serialized per tenant.';
