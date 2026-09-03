-- DABBIR owner workspace sovereignty v1.
-- A paying workspace owner is the final authority inside their own tenant.
-- Explicit membership permission arrays may narrow delegated roles, but must never
-- reduce an active owner below full workspace authority.

create or replace function dabbir_private.user_has_permission(
  p_business_id uuid,
  p_user_id uuid,
  p_permission text
) returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
select exists(
  select 1
  from public.dabbir_memberships m
  where m.business_id=p_business_id
    and m.user_id=p_user_id
    and m.status='active'
    and (
      m.role='owner'
      or
      (cardinality(m.permissions)>0 and p_permission=any(m.permissions))
      or
      (cardinality(m.permissions)=0 and case m.role
        when 'admin' then p_permission=any(array['view_business','manage_business','manage_store_operations','manage_team','view_integrations','manage_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','manage_automations','view_analytics','export_data','view_services','manage_services','view_knowledge','manage_knowledge','view_quality','manage_handoffs'])
        when 'manager' then p_permission=any(array['view_business','manage_store_operations','view_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','manage_automations','view_analytics','view_services','manage_services','view_knowledge','manage_knowledge','view_quality','manage_handoffs'])
        when 'employee' then p_permission=any(array['view_business','manage_store_operations','view_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','view_services','view_knowledge','manage_handoffs'])
        when 'staff' then p_permission=any(array['view_business','manage_store_operations','view_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','view_services','view_knowledge','manage_handoffs'])
        when 'agent' then p_permission=any(array['view_business','view_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','view_services','view_knowledge','manage_handoffs'])
        when 'viewer' then p_permission=any(array['view_business','view_conversations','view_appointments','view_analytics','view_services','view_knowledge','view_quality'])
        else false
      end)
    )
);
$$;

revoke all on function dabbir_private.user_has_permission(uuid,uuid,text) from public,anon,authenticated;
grant execute on function dabbir_private.user_has_permission(uuid,uuid,text) to service_role;

create or replace function dabbir_private.has_permission(p_business_id uuid,p_permission text)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
select (select auth.uid()) is not null
  and dabbir_private.user_has_permission(p_business_id,(select auth.uid()),p_permission);
$$;

revoke all on function dabbir_private.has_permission(uuid,text) from public,anon;
grant execute on function dabbir_private.has_permission(uuid,text) to authenticated,service_role;

-- Workspace deletion remains owner-only at the database boundary. The API adds the
-- billing guard before this RLS-authorized delete can be attempted.
drop policy if exists dabbir_businesses_owner_delete on public.dabbir_businesses;
create policy dabbir_businesses_owner_delete
on public.dabbir_businesses
for delete
to authenticated
using (
  owner_id=(select auth.uid())
  and exists(
    select 1
    from public.dabbir_memberships m
    where m.business_id=id
      and m.user_id=(select auth.uid())
      and m.role='owner'
      and m.status='active'
  )
);

comment on function dabbir_private.user_has_permission(uuid,uuid,text) is
  'Tenant permission authority. Active owner role is non-restrictable and has full authority inside its own business; explicit permission arrays only constrain delegated roles.';
