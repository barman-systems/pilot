-- Configuration visibility is not permission to perform a business action.
-- Keep the strict execution contract; expose a non-executable catalog record
-- so an owner can configure, revoke or repair an unregistered activity.
create or replace function dabbir_private.activity_configuration_contract_v1(
 p_business_id uuid,p_branch_id uuid,p_service_id uuid
) returns jsonb language plpgsql stable security definer set search_path='pg_catalog','public' as $$
declare s public.dabbir_services%rowtype; v bigint;
begin
 begin
  return dabbir_private.activity_contract_v1(p_business_id,p_branch_id,p_service_id);
 exception when raise_exception then
  if sqlerrm <> 'ACTIVITY_TYPE_UNCONFIGURED' then raise; end if;
 end;
 select se.* into strict s from public.dabbir_services se
 join public.dabbir_branch_services bs on bs.business_id=se.business_id and bs.service_id=se.id
 join public.dabbir_business_branches br on br.id=bs.branch_id and br.business_id=bs.business_id and br.status='active'
 where se.business_id=p_business_id and se.id=p_service_id and se.active and bs.branch_id=p_branch_id and bs.active;
 select coalesce(max(version),0) into v from public.dabbir_activity_service_versions
 where business_id=p_business_id and branch_id=p_branch_id and service_id=p_service_id;
 return jsonb_build_object('business_id',p_business_id,'branch_id',p_branch_id,'service_id',p_service_id,
  'service_name',coalesce(s.name_ar,s.name,s.name_en),'price',s.price_aed,'duration',s.duration_minutes,
  'configuration_status','UNCONFIGURED','configuration_error','ACTIVITY_TYPE_UNCONFIGURED',
  'activity_type',null,'contract_version',null,'owner_version',v,
  'supported_actions','[]'::jsonb,'delivery_modes','[]'::jsonb,'mode_requirements','{}'::jsonb,
  'owner_approval',true,'automatic_booking',false);
end $$;
revoke all on function dabbir_private.activity_configuration_contract_v1(uuid,uuid,uuid) from public,anon,authenticated;

do $patch$
declare definition text; anchor text;
begin
 select pg_get_functiondef('public.dabbir_activity_profile_v1(uuid,uuid)'::regprocedure) into definition;
 anchor:='dabbir_private.activity_contract_v1(b.id,p_branch_id,s.id)';
 if strpos(definition,anchor)=0 then raise exception 'ACTIVITY_PROFILE_VISIBILITY_PATCH_DRIFT'; end if;
 execute replace(definition,anchor,'dabbir_private.activity_configuration_contract_v1(b.id,p_branch_id,s.id)');
 select pg_get_functiondef('public.dabbir_activity_service_configure_v1(uuid,uuid,uuid,bigint,jsonb,text,bigint)'::regprocedure) into definition;
 anchor:='dabbir_private.activity_contract_v1(p_business_id,p_branch_id,p_service_id)';
 if strpos(definition,anchor)=0 then raise exception 'ACTIVITY_CONFIG_VISIBILITY_PATCH_DRIFT'; end if;
 execute replace(definition,anchor,'dabbir_private.activity_configuration_contract_v1(p_business_id,p_branch_id,p_service_id)');
end $patch$;
