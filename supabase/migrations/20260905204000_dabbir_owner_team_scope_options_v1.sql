-- Team governance directory with scope-safe business choices for the owner UI.
create or replace function public.dabbir_platform_staff_directory_v3(p_actor uuid)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
declare v_base jsonb; v_businesses jsonb;
begin
  perform dabbir_private.platform_assert_permission(p_actor,'manage_employees');
  v_base:=public.dabbir_platform_staff_list_v2(p_actor);
  select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'country_code',b.country_code,'business_type',b.business_type) order by b.name),'[]'::jsonb)
  into v_businesses
  from public.dabbir_businesses b
  where dabbir_private.platform_scope_allows_business(p_actor,b.id);
  return v_base || jsonb_build_object('businesses',v_businesses);
end;
$$;
revoke all on function public.dabbir_platform_staff_directory_v3(uuid) from public,anon,authenticated;
grant execute on function public.dabbir_platform_staff_directory_v3(uuid) to service_role;
