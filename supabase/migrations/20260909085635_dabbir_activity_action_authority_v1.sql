-- Enforce the registry's action contract at the database mutation boundary.
-- Existing authority, scope, confidence, idempotency and readback checks remain.
create or replace function dabbir_private.activity_assert_action_v1(
 p_business_id uuid,p_branch_id uuid,p_service_id uuid,p_action text
) returns jsonb language plpgsql stable security definer set search_path='pg_catalog','public' as $$
declare contract jsonb;
begin
 contract:=dabbir_private.activity_contract_v1(p_business_id,p_branch_id,p_service_id);
 if jsonb_typeof(contract->'supported_actions') is distinct from 'array' then raise exception 'ACTIVITY_ACTION_CONTRACT_INVALID'; end if;
 if p_action is null or not (contract->'supported_actions' ? p_action) then raise exception 'ACTIVITY_ACTION_NOT_SUPPORTED'; end if;
 return contract;
end $$;
revoke all on function dabbir_private.activity_assert_action_v1(uuid,uuid,uuid,text) from public,anon,authenticated;

do $patch$
declare definition text; anchor text; replacement text;
begin
 select pg_get_functiondef('dabbir_private.activity_contract_v1(uuid,uuid,uuid)'::regprocedure) into definition;
 anchor:=$old$if not (r->'activities' ? typ) then typ:='other'; end if;$old$;
 replacement:=$new$if not (r->'activities' ? typ) then raise exception 'ACTIVITY_TYPE_UNCONFIGURED'; end if;$new$;
 if strpos(definition,anchor)=0 then raise exception 'ACTIVITY_CONTRACT_PATCH_DRIFT'; end if;
 definition:=replace(definition,anchor,replacement);
 anchor:=$old$modes:=coalesce(c->'delivery_modes',a->'default_delivery_modes');$old$;
 replacement:=$new$modes:=coalesce(c->'delivery_modes',a->'default_delivery_modes');
 -- Home visits are an existing owner setting. Enabling them adds a choice;
 -- it does not silently replace a branch service with an off-site booking.
 if not (c ? 'delivery_modes') and exists(select 1 from public.dabbir_home_service_settings hs where hs.business_id=p_business_id and hs.enabled) then
   select jsonb_agg(v order by v) into modes from (
     select jsonb_array_elements_text(modes) v union select 'AT_CUSTOMER'
   ) supported_modes;
 end if;$new$;
 if strpos(definition,anchor)=0 then raise exception 'ACTIVITY_DELIVERY_PATCH_DRIFT'; end if;
 definition:=replace(definition,anchor,replacement);
 anchor:=$old$'legacy',legacy)::text)$old$;
 replacement:=$new$'legacy',legacy,'delivery_modes',modes)::text)$new$;
 if strpos(definition,anchor)=0 then raise exception 'ACTIVITY_VERSION_PATCH_DRIFT'; end if;
 execute replace(definition,anchor,replacement);

 select pg_get_functiondef('dabbir_private.activity_assert_state_v1(uuid,uuid,uuid,uuid,jsonb,uuid)'::regprocedure) into definition;
 anchor:=$old$contract:=dabbir_private.activity_contract_v1(p_business_id,p_branch_id,p_service_id);$old$;
 replacement:=$new$contract:=dabbir_private.activity_assert_action_v1(p_business_id,p_branch_id,p_service_id,p_state->>'pending_action');$new$;
 if strpos(definition,anchor)=0 then raise exception 'ACTIVITY_STATE_PATCH_DRIFT'; end if;
 execute replace(definition,anchor,replacement);

 select pg_get_functiondef('public.dabbir_semantic_execute_v2(uuid,uuid,bigint,text)'::regprocedure) into definition;
 anchor:=$old$then raise exception 'SEMANTIC_APPOINTMENT_SCOPE_INVALID'; end if;$old$;
 replacement:=$new$then raise exception 'SEMANTIC_APPOINTMENT_SCOPE_INVALID'; end if;
    perform dabbir_private.activity_assert_action_v1(b.business_id,c.branch_id,
      (select ap.service_id from public.dabbir_appointments ap where ap.id=a and ap.business_id=b.business_id and ap.branch_id=c.branch_id and ap.customer_id=c.customer_id),p_action);$new$;
 if strpos(definition,anchor)=0 then raise exception 'ACTIVITY_EXECUTE_PATCH_DRIFT'; end if;
 execute replace(definition,anchor,replacement);
end $patch$;
