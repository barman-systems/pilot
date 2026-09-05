-- DABBIR Owner Executive Command Center Phase 2 P0
-- Scope-aware incident read boundary. Service-role only; no browser execution.
create or replace function public.dabbir_platform_incident_read_scoped_v1(
  p_actor uuid,
  p_incident_id uuid default null,
  p_customer_no text default null,
  p_business_id uuid default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','dabbir_private'
as $$
declare
  v_limit integer:=least(greatest(coalesce(p_limit,100),1),200);
  v_global boolean;
  v_incidents jsonb;
  v_events jsonb:='[]'::jsonb;
  v_target_business uuid;
begin
  perform dabbir_private.platform_assert_permission(p_actor,'manage_incidents');
  v_global:=dabbir_private.platform_scope_is_global(p_actor);

  if p_business_id is not null and not v_global then
    perform dabbir_private.platform_assert_business_scope(p_actor,p_business_id);
  end if;

  if p_incident_id is not null then
    select i.business_id into v_target_business
    from public.dabbir_platform_owner_incidents i
    where i.id=p_incident_id;
    if not found then raise exception 'DABBIR_INCIDENT_NOT_FOUND'; end if;
    if not v_global then
      perform dabbir_private.platform_assert_business_scope(p_actor,v_target_business);
    end if;
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc),'[]'::jsonb)
  into v_incidents
  from (
    select i.*
    from public.dabbir_platform_owner_incidents i
    where (p_incident_id is null or i.id=p_incident_id)
      and (p_customer_no is null or i.customer_no=upper(trim(p_customer_no)))
      and (p_business_id is null or i.business_id=p_business_id)
      and (v_global or (i.business_id is not null and dabbir_private.platform_scope_allows_business(p_actor,i.business_id)))
    order by i.updated_at desc
    limit v_limit
  ) x;

  if p_incident_id is not null then
    select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at asc),'[]'::jsonb)
    into v_events
    from public.dabbir_platform_owner_incident_events e
    where e.incident_id=p_incident_id;
  end if;

  return jsonb_build_object('incidents',v_incidents,'events',v_events,'scope_enforced',true);
end;
$$;

revoke all on function public.dabbir_platform_incident_read_scoped_v1(uuid,uuid,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.dabbir_platform_incident_read_scoped_v1(uuid,uuid,text,uuid,integer) to service_role;