-- Make existing broker RPC entrypoints fail closed on delegated business scope.

create or replace function public.dabbir_platform_operational_snapshot_v1(p_actor uuid,p_limit integer default 80)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
begin
  return public.dabbir_platform_operational_snapshot_scoped_v2(p_actor,p_limit);
end;
$$;

create or replace function public.dabbir_platform_customer_search_v2(p_actor uuid,p_query text default null,p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','auth','dabbir_private' as $$
begin
  return public.dabbir_platform_customer_search_scoped_v3(p_actor,p_query,p_limit);
end;
$$;

-- Preserve the pre-guard operational entity implementation as a private server-only implementation.
create or replace function public.dabbir_platform_operational_entities_legacy_v1(p_actor uuid,p_business_id uuid,p_entity_type text,p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
declare v_type text:=upper(trim(coalesce(p_entity_type,''))); v_result jsonb; v_limit int:=least(greatest(coalesce(p_limit,100),1),200);
begin
  if v_type='ORDER' then
    perform dabbir_private.platform_assert_permission(p_actor,'manage_orders');
    select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'status',o.status,'workflow_status',o.workflow_status,'total_aed',o.total_aed,'paid_aed',o.paid_aed,'created_at',o.created_at) order by o.created_at desc),'[]'::jsonb)
      into v_result from (select * from public.dabbir_orders where business_id=p_business_id and coalesce(simulated,false)=false order by created_at desc limit v_limit) o;
  elsif v_type='BOOKING' then
    perform dabbir_private.platform_assert_permission(p_actor,'manage_bookings');
    select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'status',a.status,'starts_at',a.starts_at,'ends_at',a.ends_at,'customer_id',a.customer_id,'service_id',a.service_id,'worker_id',a.worker_id,'created_at',a.created_at) order by a.starts_at desc nulls last),'[]'::jsonb)
      into v_result from (select * from public.dabbir_appointments where business_id=p_business_id and coalesce(simulated,false)=false order by starts_at desc nulls last limit v_limit) a;
  elsif v_type='PRODUCT' then
    perform dabbir_private.platform_assert_permission(p_actor,'manage_products');
    select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'sku',p.sku,'name',p.name,'price_aed',p.price_aed,'active',p.active) order by p.name),'[]'::jsonb)
      into v_result from (select * from public.dabbir_products where business_id=p_business_id order by name limit v_limit) p;
  elsif v_type='SERVICE' then
    perform dabbir_private.platform_assert_permission(p_actor,'manage_services');
    select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'duration_minutes',s.duration_minutes,'price_aed',s.price_aed,'active',s.active,'category',s.category) order by s.name),'[]'::jsonb)
      into v_result from (select * from public.dabbir_services where business_id=p_business_id order by name limit v_limit) s;
  elsif v_type='BRANCH' then
    perform dabbir_private.platform_assert_permission(p_actor,'manage_businesses');
    select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'status',b.status,'timezone',b.timezone,'phone_e164',b.phone_e164,'address_text',b.address_text,'is_primary',b.is_primary,'updated_at',b.updated_at) order by b.is_primary desc,b.name),'[]'::jsonb)
      into v_result from (select * from public.dabbir_business_branches where business_id=p_business_id order by is_primary desc,name limit v_limit) b;
  elsif v_type='WHATSAPP' then
    perform dabbir_private.platform_assert_permission(p_actor,'manage_integrations');
    select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'status',w.status,'display_phone_number',w.display_phone_number,'verified_name',w.verified_name,'last_verified_at',w.last_verified_at,'last_provider_status',w.last_provider_status,'last_error',w.last_error) order by w.updated_at desc),'[]'::jsonb)
      into v_result from (select * from public.dabbir_whatsapp_connections where business_id=p_business_id order by updated_at desc limit v_limit) w;
  elsif v_type='CALENDAR' then
    perform dabbir_private.platform_assert_permission(p_actor,'manage_integrations');
    select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'provider',c.provider,'provider_email',c.provider_email,'calendar_id',c.calendar_id,'sync_direction',c.sync_direction,'sync_enabled',c.sync_enabled,'status',c.status,'last_sync_at',c.last_sync_at,'last_error',c.last_error) order by c.updated_at desc),'[]'::jsonb)
      into v_result from (select * from public.dabbir_calendar_connections where business_id=p_business_id order by updated_at desc limit v_limit) c;
  else raise exception 'DABBIR_OPERATIONAL_ENTITY_TYPE_INVALID'; end if;
  return v_result;
end;
$$;

create or replace function public.dabbir_platform_operational_entities_v1(p_actor uuid,p_business_id uuid,p_entity_type text,p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
begin
  perform dabbir_private.platform_assert_business_scope(p_actor,p_business_id);
  return public.dabbir_platform_operational_entities_legacy_v1(p_actor,p_business_id,p_entity_type,p_limit);
end;
$$;

create or replace function public.dabbir_platform_operational_action_legacy_v2(p_actor uuid,p_business_id uuid,p_action text,p_entity_id uuid,p_reason text,p_confirmation text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
declare v_action text:=upper(trim(coalesce(p_action,''))); v_before jsonb; v_after jsonb; v_audit uuid; v_status text;
begin
  if v_action<>'BRANCH_SET_STATUS' then
    return public.dabbir_platform_operational_action_v1(p_actor,p_business_id,p_action,p_entity_id,p_reason,p_confirmation,p_payload);
  end if;
  if p_business_id is null or p_entity_id is null or nullif(trim(coalesce(p_reason,'')),'') is null or trim(coalesce(p_confirmation,''))<>('EXECUTE '||v_action) then
    raise exception 'DABBIR_OPERATION_CONFIRMATION_REQUIRED';
  end if;
  perform dabbir_private.platform_assert_permission(p_actor,'manage_businesses');
  select to_jsonb(b) into v_before from public.dabbir_business_branches b where b.id=p_entity_id and b.business_id=p_business_id for update;
  if v_before is null then raise exception 'DABBIR_BRANCH_NOT_FOUND'; end if;
  v_status:=lower(trim(coalesce(p_payload->>'status','')));
  if v_status not in('active','inactive') then raise exception 'DABBIR_BRANCH_STATUS_INVALID'; end if;
  if coalesce((v_before->>'is_primary')::boolean,false) and v_status='inactive' then raise exception 'DABBIR_PRIMARY_BRANCH_DEACTIVATION_FORBIDDEN'; end if;
  update public.dabbir_business_branches set status=v_status,updated_at=now() where id=p_entity_id;
  select to_jsonb(b) into v_after from public.dabbir_business_branches b where b.id=p_entity_id;
  insert into public.dabbir_platform_owner_audit(business_id,actor_user_id,action,entity_type,entity_id,reason,confirmation,outcome,before_state,after_state,source)
  values(p_business_id,p_actor,v_action,'BRANCH',p_entity_id,left(trim(p_reason),500),left(trim(p_confirmation),120),'SUCCESS',v_before,v_after,'owner_command_center') returning id into v_audit;
  return jsonb_build_object('result','SUCCESS','audit_id',v_audit,'before_state',v_before,'after_state',v_after,'timestamp',now());
end;
$$;

create or replace function public.dabbir_platform_operational_action_v2(p_actor uuid,p_business_id uuid,p_action text,p_entity_id uuid,p_reason text,p_confirmation text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
begin
  perform dabbir_private.platform_assert_business_scope(p_actor,p_business_id);
  return public.dabbir_platform_operational_action_legacy_v2(p_actor,p_business_id,p_action,p_entity_id,p_reason,p_confirmation,p_payload);
end;
$$;

revoke all on function public.dabbir_platform_operational_entities_legacy_v1(uuid,uuid,text,integer) from public,anon,authenticated;
revoke all on function public.dabbir_platform_operational_action_legacy_v2(uuid,uuid,text,uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.dabbir_platform_operational_snapshot_v1(uuid,integer) from public,anon,authenticated;
revoke all on function public.dabbir_platform_customer_search_v2(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.dabbir_platform_operational_entities_v1(uuid,uuid,text,integer) from public,anon,authenticated;
revoke all on function public.dabbir_platform_operational_action_v2(uuid,uuid,text,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.dabbir_platform_operational_snapshot_v1(uuid,integer) to service_role;
grant execute on function public.dabbir_platform_customer_search_v2(uuid,text,integer) to service_role;
grant execute on function public.dabbir_platform_operational_entities_v1(uuid,uuid,text,integer) to service_role;
grant execute on function public.dabbir_platform_operational_action_v2(uuid,uuid,text,uuid,text,text,jsonb) to service_role;
grant execute on function public.dabbir_platform_operational_entities_legacy_v1(uuid,uuid,text,integer) to service_role;
grant execute on function public.dabbir_platform_operational_action_legacy_v2(uuid,uuid,text,uuid,text,text,jsonb) to service_role;
