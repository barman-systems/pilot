-- Restore ordinary team-management for active owner/admin sessions.
-- MFA step-up remains enforced for sensitive integrations, billing, and export operations via dabbir_private.has_permission.
create or replace function dabbir_private.can_manage_role(p_business_id uuid, p_target_role text)
returns boolean
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $$
select (select auth.uid()) is not null
  and exists(
    select 1
    from public.dabbir_memberships m
    where m.business_id = p_business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (
        (m.role = 'owner' and p_target_role in ('admin','manager','employee','staff','viewer','agent'))
        or
        (m.role = 'admin' and p_target_role in ('manager','employee','staff','viewer','agent'))
      )
  );
$$;
revoke all on function dabbir_private.can_manage_role(uuid,text) from public, anon;
grant execute on function dabbir_private.can_manage_role(uuid,text) to authenticated, service_role;
