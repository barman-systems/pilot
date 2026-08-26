-- DABBIR operational runtime v11
-- Move handoff creation fully under caller RLS and remove exposed SECURITY DEFINER execution.

drop policy if exists pilot_handoffs_insert on public.pilot_handoffs;
create policy pilot_handoffs_insert
on public.pilot_handoffs
for insert
to authenticated
with check (pilot_private.has_permission(business_id,'manage_handoffs'));

create or replace function public.pilot_create_handoff(
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
security invoker
set search_path to 'public','pg_temp'
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not pilot_private.has_permission(p_business_id,'manage_handoffs') then raise exception 'HANDOFF_MANAGEMENT_REQUIRED'; end if;
  if p_route_class not in ('SALES','SUPPORT','BOOKING','RETURNS','COMPLAINT','OWNER_DECISION') then raise exception 'INVALID_HANDOFF_ROUTE'; end if;
  if p_routing_strategy not in ('least_open','round_robin','skill','priority') then raise exception 'INVALID_ROUTING_STRATEGY'; end if;
  if not exists(select 1 from public.pilot_conversations c where c.id=p_conversation_id and c.business_id=p_business_id) then raise exception 'CONVERSATION_NOT_IN_BUSINESS'; end if;
  if p_customer_id is not null and not exists(select 1 from public.pilot_customers c where c.id=p_customer_id and c.business_id=p_business_id) then raise exception 'CUSTOMER_NOT_IN_BUSINESS'; end if;

  insert into public.pilot_handoffs(business_id,conversation_id,customer_id,route_class,reason,priority,routing_strategy,summary,attempted_actions,unresolved_items)
  values(p_business_id,p_conversation_id,p_customer_id,p_route_class,left(coalesce(p_reason,''),240),greatest(0,least(100,p_priority)),p_routing_strategy,left(coalesce(p_summary,''),1200),coalesce(p_attempted_actions,'[]'::jsonb),coalesce(p_unresolved_items,'[]'::jsonb))
  on conflict (business_id,conversation_id) where state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')
  do update set route_class=excluded.route_class,reason=excluded.reason,priority=greatest(public.pilot_handoffs.priority,excluded.priority),summary=excluded.summary,attempted_actions=excluded.attempted_actions,unresolved_items=excluded.unresolved_items,updated_at=now()
  returning id into v_id;

  update public.pilot_conversations
  set state='action_required',updated_at=now()
  where id=p_conversation_id and business_id=p_business_id and state<>'human_active';
  return v_id;
end;
$$;

revoke all on function public.pilot_create_handoff(uuid,uuid,uuid,text,text,integer,text,text,jsonb,jsonb) from public;
revoke all on function public.pilot_create_handoff(uuid,uuid,uuid,text,text,integer,text,text,jsonb,jsonb) from anon;
grant execute on function public.pilot_create_handoff(uuid,uuid,uuid,text,text,integer,text,text,jsonb,jsonb) to authenticated;
