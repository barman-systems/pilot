-- Tenant-scoped filter options for the owner measurement UI.

create or replace function public.dabbir_owner_measurement_options_v1(p_scope jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
set timezone='UTC'
as $$
declare
  v_businesses jsonb; v_activities jsonb; v_branches jsonb; v_channels jsonb; v_providers jsonb; v_models jsonb;
begin
  if upper(coalesce(p_scope->>'authority_role','')) not in ('ROOT_OWNER','OWNER_DELEGATE') then raise exception 'OWNER_MEASUREMENT_AUTHORITY_REQUIRED'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'activity_type',b.business_type) order by b.name,b.id),'[]'::jsonb)
    into v_businesses
  from public.dabbir_businesses b
  join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=b.id;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.activity_type),'[]'::jsonb) into v_activities
  from (
    select distinct b.business_type activity_type
    from public.dabbir_businesses b join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=b.id
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('id',br.id,'business_id',br.business_id,'name',br.name) order by br.name,br.id),'[]'::jsonb)
    into v_branches
  from public.dabbir_business_branches br
  join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=br.business_id;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.channel),'[]'::jsonb) into v_channels
  from (
    select distinct coalesce(f.channel,'unknown') channel
    from public.dabbir_ai_usage_fact_v1 f join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=f.business_id
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.provider),'[]'::jsonb) into v_providers
  from (
    select distinct coalesce(f.provider,'unknown') provider
    from public.dabbir_ai_usage_fact_v1 f join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=f.business_id
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.provider,x.model),'[]'::jsonb) into v_models
  from (
    select distinct coalesce(f.provider,'unknown') provider,coalesce(f.model,'unknown') model
    from public.dabbir_ai_usage_fact_v1 f join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=f.business_id
  ) x;

  return jsonb_build_object('businesses',v_businesses,'activities',v_activities,'branches',v_branches,'channels',v_channels,'providers',v_providers,'models',v_models);
end;
$$;
revoke all on function public.dabbir_owner_measurement_options_v1(jsonb) from public,anon,authenticated;
grant execute on function public.dabbir_owner_measurement_options_v1(jsonb) to service_role;
comment on function public.dabbir_owner_measurement_options_v1(jsonb) is 'Tenant-scoped server-only filter options for owner measurement surfaces.';
