-- DABBIR Owner Command Center Phase 2 / P0
-- Fail-closed business scope enforcement. Existing operational implementations remain intact
-- behind scoped wrappers to reduce regression risk.

create or replace function dabbir_private.platform_scope_allows_business(p_user_id uuid,p_business_id uuid)
returns boolean language plpgsql stable set search_path='pg_catalog','public','dabbir_private' as $$
declare v_scope jsonb; v_type text; v_region text;
begin
  if p_user_id is null or p_business_id is null then return false; end if;
  select access_scope into v_scope from public.dabbir_platform_admins
  where user_id=p_user_id and dabbir_private.platform_admin_is_active(p_user_id);
  if not found then return false; end if;
  v_type:=coalesce(v_scope->>'type','');
  if v_type='ALL_BUSINESSES' then return true; end if;
  if v_type='SPECIFIC_BUSINESS' then
    return nullif(v_scope->>'business_id','')::uuid=p_business_id;
  end if;
  if v_type='ASSIGNED_BUSINESSES_ONLY' then
    return exists(
      select 1 from jsonb_array_elements_text(coalesce(v_scope->'business_ids','[]'::jsonb)) x
      where x::uuid=p_business_id
    );
  end if;
  if v_type='SPECIFIC_REGION' then
    v_region:=upper(coalesce(v_scope->>'region_code',v_scope->>'country_code',''));
    if v_region='' then return false; end if;
    return exists(select 1 from public.dabbir_businesses b where b.id=p_business_id and upper(coalesce(b.country_code,''))=v_region);
  end if;
  -- OWN_TASKS_ONLY never grants direct business data access.
  return false;
exception when others then return false;
end;
$$;

create or replace function dabbir_private.platform_assert_business_scope(p_user_id uuid,p_business_id uuid)
returns void language plpgsql stable set search_path='pg_catalog','public','dabbir_private' as $$
begin
  if not dabbir_private.platform_scope_allows_business(p_user_id,p_business_id) then
    raise exception 'DABBIR_BUSINESS_SCOPE_REQUIRED';
  end if;
end;
$$;

create or replace function public.dabbir_platform_operational_snapshot_scoped_v2(p_actor uuid,p_limit integer default 80)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
declare v_result jsonb; v_limit int:=least(greatest(coalesce(p_limit,80),1),200);
begin
  if not (
    dabbir_private.platform_has_permission(p_actor,'manage_businesses') or
    dabbir_private.platform_has_permission(p_actor,'manage_orders') or
    dabbir_private.platform_has_permission(p_actor,'manage_bookings') or
    dabbir_private.platform_has_permission(p_actor,'manage_products') or
    dabbir_private.platform_has_permission(p_actor,'manage_services') or
    dabbir_private.platform_has_permission(p_actor,'manage_integrations')
  ) then raise exception 'DABBIR_OPERATIONAL_PERMISSION_REQUIRED'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',b.id,'name',b.name,'business_type',b.business_type,'country',b.country_code,'currency',b.currency_code,'timezone',b.timezone,'demo_mode',b.demo_mode,
    'products',(select count(*) from public.dabbir_products p where p.business_id=b.id),
    'services',(select count(*) from public.dabbir_services s where s.business_id=b.id),
    'orders',(select count(*) from public.dabbir_orders o where o.business_id=b.id and coalesce(o.simulated,false)=false),
    'bookings',(select count(*) from public.dabbir_appointments a where a.business_id=b.id and coalesce(a.simulated,false)=false),
    'whatsapp',coalesce((select jsonb_build_object('id',w.id,'status',w.status,'last_verified_at',w.last_verified_at,'last_provider_status',w.last_provider_status,'last_error',w.last_error) from public.dabbir_whatsapp_connections w where w.business_id=b.id order by w.updated_at desc limit 1),'{}'::jsonb),
    'calendars',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'provider',c.provider,'status',c.status,'sync_enabled',c.sync_enabled,'last_sync_at',c.last_sync_at,'last_error',c.last_error)) from public.dabbir_calendar_connections c where c.business_id=b.id),'[]'::jsonb)
  ) order by b.updated_at desc),'[]'::jsonb) into v_result
  from (
    select * from public.dabbir_businesses x
    where dabbir_private.platform_scope_allows_business(p_actor,x.id)
    order by updated_at desc limit v_limit
  ) b;
  return v_result;
end;
$$;

create or replace function public.dabbir_platform_operational_entities_scoped_v2(p_actor uuid,p_business_id uuid,p_entity_type text,p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
begin
  perform dabbir_private.platform_assert_business_scope(p_actor,p_business_id);
  return public.dabbir_platform_operational_entities_v1(p_actor,p_business_id,p_entity_type,p_limit);
end;
$$;

create or replace function public.dabbir_platform_operational_action_scoped_v3(p_actor uuid,p_business_id uuid,p_action text,p_entity_id uuid,p_reason text,p_confirmation text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
begin
  perform dabbir_private.platform_assert_business_scope(p_actor,p_business_id);
  return public.dabbir_platform_operational_action_v2(p_actor,p_business_id,p_action,p_entity_id,p_reason,p_confirmation,p_payload);
end;
$$;

create or replace function public.dabbir_platform_customer_search_scoped_v3(p_actor uuid,p_query text default null,p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','auth','dabbir_private' as $$
declare v_q text:=nullif(trim(p_query),''); v_limit int:=least(greatest(coalesce(p_limit,50),1),100); v_result jsonb;
begin
  perform dabbir_private.platform_assert_permission(p_actor,'manage_customers');
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_result
  from (
    select a.user_id,a.customer_no,u.email,u.phone,u.created_at,u.last_sign_in_at,
      count(distinct b.id)::int as business_count,
      coalesce(jsonb_agg(distinct jsonb_build_object('id',b.id,'name',b.name,'type',b.business_type,'country',b.country_code)) filter(where b.id is not null),'[]'::jsonb) as businesses
    from public.dabbir_user_accounts a
    join auth.users u on u.id=a.user_id
    left join public.dabbir_memberships m on m.user_id=a.user_id and m.status='active'
    left join public.dabbir_businesses b on b.id=m.business_id and dabbir_private.platform_scope_allows_business(p_actor,b.id)
    where exists(
      select 1 from public.dabbir_memberships sm
      where sm.user_id=a.user_id and sm.status='active' and dabbir_private.platform_scope_allows_business(p_actor,sm.business_id)
    ) and (
      v_q is null
      or a.customer_no=upper(v_q)
      or lower(coalesce(u.email,'')) like '%'||lower(replace(replace(v_q,'%','\\%'),'_','\\_'))||'%' escape '\\'
      or regexp_replace(coalesce(u.phone,''),'[^0-9+]','','g') like '%'||regexp_replace(v_q,'[^0-9+]','','g')||'%'
      or exists(select 1 from public.dabbir_memberships qm join public.dabbir_businesses qb on qb.id=qm.business_id where qm.user_id=a.user_id and qm.status='active' and dabbir_private.platform_scope_allows_business(p_actor,qb.id) and qb.name ilike '%'||replace(replace(v_q,'%','\\%'),'_','\\_')||'%' escape '\\')
    )
    group by a.user_id,a.customer_no,u.email,u.phone,u.created_at,u.last_sign_in_at
    order by u.last_sign_in_at desc nulls last,u.created_at desc
    limit v_limit
  ) x;
  insert into dabbir_private.platform_customer_admin_audit(actor_user_id,action,details)
  values(p_actor,'customer_search_scoped_v3',jsonb_build_object('has_query',v_q is not null,'limit',v_limit));
  return v_result;
end;
$$;

create or replace function public.dabbir_platform_customer_360_scoped_v2(p_actor uuid,p_target_user_id uuid)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
declare v_raw jsonb; v_scope_type text; v_businesses jsonb; v_support jsonb; v_incidents jsonb; v_audit jsonb;
begin
  perform dabbir_private.platform_assert_permission(p_actor,'manage_customers');
  if not exists(
    select 1 from public.dabbir_memberships m
    where m.user_id=p_target_user_id and m.status='active' and dabbir_private.platform_scope_allows_business(p_actor,m.business_id)
  ) then raise exception 'DABBIR_CUSTOMER_OUTSIDE_SCOPE'; end if;

  v_raw:=public.dabbir_platform_customer_360_v1(p_actor,p_target_user_id);
  select coalesce(access_scope->>'type','') into v_scope_type from public.dabbir_platform_admins where user_id=p_actor;
  if v_scope_type='ALL_BUSINESSES' then return v_raw; end if;

  select coalesce(jsonb_agg(x.value),'[]'::jsonb) into v_businesses
  from jsonb_array_elements(coalesce(v_raw->'businesses','[]'::jsonb)) x
  where dabbir_private.platform_scope_allows_business(p_actor,nullif(x.value->>'id','')::uuid);

  select coalesce(jsonb_agg(x.value),'[]'::jsonb) into v_support
  from jsonb_array_elements(coalesce(v_raw->'support','[]'::jsonb)) x
  where nullif(x.value->>'business_id','') is not null and dabbir_private.platform_scope_allows_business(p_actor,(x.value->>'business_id')::uuid);

  select coalesce(jsonb_agg(x.value),'[]'::jsonb) into v_incidents
  from jsonb_array_elements(coalesce(v_raw->'incidents','[]'::jsonb)) x
  where nullif(x.value->>'business_id','') is not null and dabbir_private.platform_scope_allows_business(p_actor,(x.value->>'business_id')::uuid);

  select coalesce(jsonb_agg(x.value),'[]'::jsonb) into v_audit
  from jsonb_array_elements(coalesce(v_raw->'audit_history','[]'::jsonb)) x
  where nullif(x.value->>'target_business_id','') is not null and dabbir_private.platform_scope_allows_business(p_actor,(x.value->>'target_business_id')::uuid);

  return jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(v_raw,'{businesses}',v_businesses,true),'{support}',v_support,true),'{incidents}',v_incidents,true),'{audit_history}',v_audit,true),'{payments}','[]'::jsonb,true),'{feedback}','[]'::jsonb,true);
end;
$$;

revoke all on function dabbir_private.platform_scope_allows_business(uuid,uuid) from public,anon,authenticated;
revoke all on function dabbir_private.platform_assert_business_scope(uuid,uuid) from public,anon,authenticated;
revoke all on function public.dabbir_platform_operational_snapshot_scoped_v2(uuid,integer) from public,anon,authenticated;
revoke all on function public.dabbir_platform_operational_entities_scoped_v2(uuid,uuid,text,integer) from public,anon,authenticated;
revoke all on function public.dabbir_platform_operational_action_scoped_v3(uuid,uuid,text,uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.dabbir_platform_customer_search_scoped_v3(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.dabbir_platform_customer_360_scoped_v2(uuid,uuid) from public,anon,authenticated;

grant execute on function public.dabbir_platform_operational_snapshot_scoped_v2(uuid,integer) to service_role;
grant execute on function public.dabbir_platform_operational_entities_scoped_v2(uuid,uuid,text,integer) to service_role;
grant execute on function public.dabbir_platform_operational_action_scoped_v3(uuid,uuid,text,uuid,text,text,jsonb) to service_role;
grant execute on function public.dabbir_platform_customer_search_scoped_v3(uuid,text,integer) to service_role;
grant execute on function public.dabbir_platform_customer_360_scoped_v2(uuid,uuid) to service_role;
