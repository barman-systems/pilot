-- DABBIR operational runtime v10
-- Purpose: allow ordinary owner/admin operations without blanket MFA while preserving
-- step-up for sensitive integration/billing/export actions; harden runtime RPCs.

create or replace function dabbir_private.has_permission(p_business_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $$
select (select auth.uid()) is not null and exists (
  select 1
  from public.dabbir_memberships m
  where m.business_id=p_business_id
    and m.user_id=(select auth.uid())
    and m.status='active'
    and (
      m.role not in ('owner','admin')
      or p_permission <> all(array['manage_integrations','manage_billing','export_data']::text[])
      or coalesce((select auth.jwt()->>'aal'),'aal1')='aal2'
    )
    and (
      (cardinality(m.permissions) > 0 and p_permission = any(m.permissions))
      or
      (cardinality(m.permissions) = 0 and case m.role
        when 'owner' then p_permission=any(array['view_business','manage_business','manage_team','view_integrations','manage_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','manage_automations','view_analytics','manage_billing','export_data','view_services','manage_services','view_knowledge','manage_knowledge','view_quality','manage_handoffs'])
        when 'admin' then p_permission=any(array['view_business','manage_business','manage_team','view_integrations','manage_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','manage_automations','view_analytics','export_data','view_services','manage_services','view_knowledge','manage_knowledge','view_quality','manage_handoffs'])
        when 'manager' then p_permission=any(array['view_business','view_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','manage_automations','view_analytics','view_services','manage_services','view_knowledge','manage_knowledge','view_quality','manage_handoffs'])
        when 'employee' then p_permission=any(array['view_business','view_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','view_services','view_knowledge','manage_handoffs'])
        when 'staff' then p_permission=any(array['view_business','view_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','view_services','view_knowledge','manage_handoffs'])
        when 'agent' then p_permission=any(array['view_business','view_integrations','view_customers','edit_customers','view_conversations','reply_conversations','view_appointments','manage_appointments','view_services','view_knowledge','manage_handoffs'])
        when 'viewer' then p_permission=any(array['view_business','view_integrations','view_customers','view_conversations','view_appointments','view_analytics','view_services','view_knowledge','view_quality'])
        else false end)
    )
);
$$;

-- Business visibility must not require aal2 for routine application use.
drop policy if exists dabbir_businesses_member_select on public.dabbir_businesses;
create policy dabbir_businesses_member_select
on public.dabbir_businesses
for select
to authenticated
using (dabbir_private.has_permission(id,'view_business'));

-- AI reply gate must execute under caller RLS and caller permissions.
create or replace function public.dabbir_ai_may_reply(p_business_id uuid, p_conversation_id uuid)
returns boolean
language sql
stable
security invoker
set search_path to 'public','pg_temp'
as $$
  select dabbir_private.has_permission(p_business_id,'reply_conversations')
    and exists(
      select 1 from public.dabbir_conversations c
      where c.id=p_conversation_id
        and c.business_id=p_business_id
        and c.state in ('ai_active','waiting_customer','action_required')
    )
    and not exists(
      select 1 from public.dabbir_handoffs h
      where h.business_id=p_business_id
        and h.conversation_id=p_conversation_id
        and h.state in ('ASSIGNED','HUMAN_ACTIVE')
    );
$$;

revoke all on function public.dabbir_ai_may_reply(uuid,uuid) from public;
revoke all on function public.dabbir_ai_may_reply(uuid,uuid) from anon;
grant execute on function public.dabbir_ai_may_reply(uuid,uuid) to authenticated;

-- Keep the handoff creator definer only because it performs an atomic multi-table write,
-- but require an authenticated business permission before bypassing RLS.
create or replace function public.dabbir_create_handoff(
  p_business_id uuid,
  p_conversation_id uuid,
  p_customer_id uuid,
  p_route_class text,
  p_reason text,
  p_priority integer default 50,
  p_routing_strategy text default 'least_open',
  p_summary text default '',
  p_attempted_actions jsonb default '[]'::jsonb,
  p_unresolved_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not dabbir_private.has_permission(p_business_id,'manage_handoffs') then raise exception 'HANDOFF_MANAGEMENT_REQUIRED'; end if;
  if p_route_class not in ('SALES','SUPPORT','BOOKING','RETURNS','COMPLAINT','OWNER_DECISION') then raise exception 'INVALID_HANDOFF_ROUTE'; end if;
  if p_routing_strategy not in ('least_open','round_robin','skill','priority') then raise exception 'INVALID_ROUTING_STRATEGY'; end if;
  if not exists(select 1 from public.dabbir_conversations c where c.id=p_conversation_id and c.business_id=p_business_id) then raise exception 'CONVERSATION_NOT_IN_BUSINESS'; end if;
  if p_customer_id is not null and not exists(select 1 from public.dabbir_customers c where c.id=p_customer_id and c.business_id=p_business_id) then raise exception 'CUSTOMER_NOT_IN_BUSINESS'; end if;

  insert into public.dabbir_handoffs(business_id,conversation_id,customer_id,route_class,reason,priority,routing_strategy,summary,attempted_actions,unresolved_items)
  values(p_business_id,p_conversation_id,p_customer_id,p_route_class,left(coalesce(p_reason,''),240),greatest(0,least(100,p_priority)),p_routing_strategy,left(coalesce(p_summary,''),1200),coalesce(p_attempted_actions,'[]'::jsonb),coalesce(p_unresolved_items,'[]'::jsonb))
  on conflict (business_id,conversation_id) where state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')
  do update set route_class=excluded.route_class,reason=excluded.reason,priority=greatest(public.dabbir_handoffs.priority,excluded.priority),summary=excluded.summary,attempted_actions=excluded.attempted_actions,unresolved_items=excluded.unresolved_items,updated_at=now()
  returning id into v_id;

  update public.dabbir_conversations
  set state='action_required',updated_at=now()
  where id=p_conversation_id and business_id=p_business_id and state<>'human_active';
  return v_id;
end;
$$;

revoke all on function public.dabbir_create_handoff(uuid,uuid,uuid,text,text,integer,text,text,jsonb,jsonb) from public;
revoke all on function public.dabbir_create_handoff(uuid,uuid,uuid,text,text,integer,text,text,jsonb,jsonb) from anon;
grant execute on function public.dabbir_create_handoff(uuid,uuid,uuid,text,text,integer,text,text,jsonb,jsonb) to authenticated;
