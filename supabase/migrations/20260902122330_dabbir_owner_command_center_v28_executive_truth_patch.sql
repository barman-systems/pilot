do $$ begin
  if to_regprocedure('public.dabbir_platform_owner_executive_v2_base(uuid)') is null and to_regprocedure('public.dabbir_platform_owner_executive_v2(uuid)') is not null then
    alter function public.dabbir_platform_owner_executive_v2(uuid) rename to dabbir_platform_owner_executive_v2_base;
  end if;
end $$;

create or replace function public.dabbir_platform_owner_executive_v3(p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,dabbir_private,auth,pg_temp
as $$
declare v jsonb; v_active bigint; v_status text; begin
  perform dabbir_private.platform_assert_admin(p_actor_user_id);
  v:=public.dabbir_platform_owner_executive_v2_base(p_actor_user_id);
  select count(distinct m.user_id) into v_active
  from public.dabbir_memberships m
  join public.dabbir_businesses b on b.id=m.business_id
  join auth.users u on u.id=m.user_id
  where lower(coalesce(m.status,''))='active'
    and u.last_sign_in_at>=now()-interval '7 days'
    and coalesce(b.demo_mode,false)=false
    and coalesce(b.name,'') !~* '^DABBIR (AI )?(QA|Away QA)([[:space:]]|$)'
    and coalesce(b.name,'') !~* 'QA CAPACITY'
    and lower(coalesce(b.name,'')) not like '% demo%'
    and lower(coalesce(b.slug,'')) not like '%demo%';
  v:=jsonb_set(v,'{executive_pulse}',coalesce(v->'executive_pulse','{}'::jsonb)||jsonb_build_object('active_customers',v_active,'active_customers_state','MEASURED_AUTH_LAST_SIGN_IN_7D_EXCLUDING_QA'));
  v_status:=case
    when coalesce((v#>>'{customer_health,red}')::int,0)>0 then 'red'
    when coalesce((v#>>'{customer_health,yellow}')::int,0)>0 then 'yellow'
    when coalesce((v#>>'{reliability,runtime_5xx_24h}')::int,0)>0 then 'yellow'
    when coalesce((v#>>'{reliability,synthetic_5xx_24h}')::int,0)>0 then 'yellow'
    else 'green' end;
  v:=jsonb_set(v,'{executive_pulse,overall_status}',to_jsonb(v_status));
  v:=jsonb_set(v,'{policy}',coalesce(v->'policy','{}'::jsonb)||jsonb_build_object('version','executive-v3'));
  return v;
end $$;
revoke all on function public.dabbir_platform_owner_executive_v3(uuid) from public,anon,authenticated;
grant execute on function public.dabbir_platform_owner_executive_v3(uuid) to service_role;

create or replace function public.dabbir_platform_owner_executive_v2(p_actor_user_id uuid)
returns jsonb language sql security invoker set search_path=pg_catalog,public,dabbir_private,pg_temp as $$ select public.dabbir_platform_owner_executive_v3(p_actor_user_id); $$;
revoke all on function public.dabbir_platform_owner_executive_v2(uuid) from public,anon,authenticated;
grant execute on function public.dabbir_platform_owner_executive_v2(uuid) to service_role;

create or replace function public.dabbir_platform_owner_executive_v1(p_actor_user_id uuid)
returns jsonb language sql security invoker set search_path=pg_catalog,public,dabbir_private,pg_temp as $$ select public.dabbir_platform_owner_executive_v3(p_actor_user_id); $$;
revoke all on function public.dabbir_platform_owner_executive_v1(uuid) from public,anon,authenticated;
grant execute on function public.dabbir_platform_owner_executive_v1(uuid) to service_role;
