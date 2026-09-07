-- Owner dashboard consolidation: repair existing RPCs in place; no tables, columns or data removed.
-- Snapshot source: production pg_get_functiondef, 2026-09-07; P2 granular guards preserved. See docs/audits/owner-dashboard-consolidation.md.
-- Reversible counterpart: supabase/rollback/20260907110000_owner_dashboard_consolidation.sql.
-- Keep signatures stable for current and preview clients. Backend deployment precedes frontend promotion.
CREATE OR REPLACE FUNCTION public.dabbir_platform_command_center_overview_v1(p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth', 'dabbir_private'
AS $function$
declare
  v_identity jsonb;
  v_customer boolean;
  v_support boolean;
  v_incident boolean;
  v_integration boolean;
  v_ceo boolean;
  v_system boolean;
  v_fin boolean;
  v_ops jsonb;
  v_global boolean;
  v_ceo_data jsonb;
begin
  v_identity:=dabbir_private.platform_identity(p_actor);
  if not dabbir_private.platform_admin_is_active(p_actor) then
    raise exception 'DABBIR_PLATFORM_ADMIN_REQUIRED';
  end if;
  v_global:=dabbir_private.platform_scope_is_global(p_actor);
  v_customer:=dabbir_private.platform_effective_capability(p_actor,'customers.view');
  v_support:=dabbir_private.platform_effective_capability(p_actor,'support.view');
  v_incident:=dabbir_private.platform_effective_capability(p_actor,'incidents.view');
  v_integration:=dabbir_private.platform_effective_capability(p_actor,'integrations.view');
  v_ceo:=v_global and dabbir_private.platform_effective_capability(p_actor,'ceo.view');
  v_system:=v_global and dabbir_private.platform_effective_capability(p_actor,'system.view');
  v_fin:=v_global and dabbir_private.platform_effective_capability(p_actor,'payments.view');
  if v_system then v_ops:=public.dabbir_owner_ops_metrics_v1(); else v_ops:='{}'::jsonb; end if;

  if v_ceo then
    select jsonb_build_object('queued',count(*) filter(where status='QUEUED'),'claimed',count(*) filter(where status='CLAIMED'),'in_progress',count(*) filter(where status='IN_PROGRESS'),'blocked',count(*) filter(where status='BLOCKED')) into v_ceo_data
    from (select case e.status when 'open' then 'QUEUED' when 'claimed' then 'IN_PROGRESS' when 'resolved' then 'DONE' when 'escalated' then 'BLOCKED' when 'ignored' then 'CANCELLED' else c.status end status
      from dabbir_private.dabbir_ceo_commands c left join dabbir_private.executive_events e on e.source='owner-directive' and e.kind='ceo_command' and e.external_ref=c.id::text) command_state;
  end if;
  return jsonb_build_object(
    'generated_at',now(),
    'identity',v_identity,'scope',case when v_global then 'GLOBAL' else 'AUTHORIZED_BUSINESSES' end,
    'customers',case when v_customer then jsonb_build_object(
      'accounts',(select count(*) from public.dabbir_user_accounts ua where v_global or exists(select 1 from public.dabbir_memberships m where m.user_id=ua.user_id and m.status='active' and dabbir_private.platform_scope_allows_business(p_actor,m.business_id))),
      'live_businesses',(select count(*) from public.dabbir_businesses b where (v_global or dabbir_private.platform_scope_allows_business(p_actor,b.id)) and coalesce(b.demo_mode,false)=false
        and coalesce(b.name,'') !~* '^DABBIR (AI )?(QA|Away QA)([[:space:]]|$)'
        and coalesce(b.name,'') !~* 'QA CAPACITY'
        and lower(coalesce(b.name,'')) not like '% demo%'
        and lower(coalesce(b.slug,'')) not like '%demo%')
    ) else jsonb_build_object('state','NO_PERMISSION') end,
    'support',case when v_support then jsonb_build_object(
      'open',(select count(*) from dabbir_private.platform_customer_support_cases where (v_global or dabbir_private.platform_scope_allows_business(p_actor,business_id)) and lower(status) not in('closed','resolved')),
      'sla_breached',(select count(*) from dabbir_private.platform_customer_support_cases where (v_global or dabbir_private.platform_scope_allows_business(p_actor,business_id)) and lower(status) not in('closed','resolved') and sla_due_at is not null and sla_due_at<now())
    ) else jsonb_build_object('state','NO_PERMISSION') end,
    'incidents',case when v_incident then jsonb_build_object(
      'open',(select count(*) from public.dabbir_platform_owner_incidents where (v_global or dabbir_private.platform_scope_allows_business(p_actor,business_id)) and lower(status) not in('closed','resolved','done','cancelled')),
      'critical',(select count(*) from public.dabbir_platform_owner_incidents where (v_global or dabbir_private.platform_scope_allows_business(p_actor,business_id)) and lower(status) not in('closed','resolved','done','cancelled') and lower(priority) in('urgent','high'))
    ) else jsonb_build_object('state','NO_PERMISSION') end,
    'ceo',case when v_ceo then v_ceo_data||jsonb_build_object(
      'decisions_waiting',case when v_identity->>'role'='ROOT_OWNER' then (select count(*) from dabbir_private.executive_escalations where status='open') else null end
    ) else jsonb_build_object('state','NO_PERMISSION') end,
    'whatsapp',case when v_integration then jsonb_build_object(
      'configured',(select count(*) from public.dabbir_whatsapp_connections where v_global or dabbir_private.platform_scope_allows_business(p_actor,business_id)),
      'verified_recent',(select count(*) from public.dabbir_whatsapp_connections where (v_global or dabbir_private.platform_scope_allows_business(p_actor,business_id)) and last_verified_at>=now()-interval '24 hours' and last_provider_status between 200 and 299 and last_error is null),
      'error',(select count(*) from public.dabbir_whatsapp_connections where (v_global or dabbir_private.platform_scope_allows_business(p_actor,business_id)) and (last_error is not null or status='error')),
      'needs_instrumentation',(select count(*) from public.dabbir_whatsapp_connections where (v_global or dabbir_private.platform_scope_allows_business(p_actor,business_id)) and last_verified_at is null)
    ) else jsonb_build_object('state','NO_PERMISSION') end,
    'calendar',case when v_integration then jsonb_build_object(
      'configured',(select count(*) from public.dabbir_calendar_connections where v_global or dabbir_private.platform_scope_allows_business(p_actor,business_id)),
      'verified_recent',(select count(*) from public.dabbir_calendar_connections where (v_global or dabbir_private.platform_scope_allows_business(p_actor,business_id)) and sync_enabled=true and status='active' and last_sync_at>=now()-interval '24 hours' and last_error is null),
      'error',(select count(*) from public.dabbir_calendar_connections where (v_global or dabbir_private.platform_scope_allows_business(p_actor,business_id)) and (last_error is not null or status='error')),
      'needs_instrumentation',(select count(*) from public.dabbir_calendar_connections where (v_global or dabbir_private.platform_scope_allows_business(p_actor,business_id)) and last_sync_at is null)
    ) else jsonb_build_object('state','NO_PERMISSION') end,
    'payments',case when v_fin then jsonb_build_object(
      'failed',(select count(*) from public.dabbir_billing_accounts where lower(coalesce(status,'')) in('past_due','unpaid','incomplete','incomplete_expired') or lower(coalesce(last_invoice_status,''))='payment_failed'),
      'environment',case when exists(select 1 from public.dabbir_stripe_events where livemode=true) then 'LIVE' else 'SANDBOX_ONLY' end
    ) else jsonb_build_object('state','NO_PERMISSION') end,
    'system',case when v_system then jsonb_build_object(
      'runtime_5xx_24h',coalesce(v_ops->'runtime_5xx_24h','null'::jsonb),
      'runtime_5xx_state',coalesce(v_ops->>'runtime_5xx_state','NEEDS_INSTRUMENTATION'),
      'synthetic_5xx_24h',coalesce(v_ops->'synthetic_5xx_24h','null'::jsonb),
      'api_p50_ms',coalesce(v_ops->'api_p50_ms','null'::jsonb),
      'api_p95_ms',coalesce(v_ops->'api_p95_ms','null'::jsonb),
      'api_p99_ms',coalesce(v_ops->'api_p99_ms','null'::jsonb),
      'sample_count_24h',coalesce(v_ops->'sample_count_24h','0'::jsonb)
    ) else jsonb_build_object('state','NO_PERMISSION') end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.dabbir_platform_customer_360_scoped_v2(p_actor uuid, p_target_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dabbir_private'
AS $function$
declare v_global boolean; v_raw jsonb; v_scope_type text; v_businesses jsonb; v_support jsonb; v_incidents jsonb; v_audit jsonb;
begin
 perform dabbir_private.platform_assert_permission(p_actor,'manage_customers');
 v_global:=dabbir_private.platform_scope_is_global(p_actor);
 if not v_global and not exists(select 1 from public.dabbir_memberships m where m.user_id=p_target_user_id and m.status='active' and dabbir_private.platform_scope_allows_business(p_actor,m.business_id)) then raise exception 'DABBIR_CUSTOMER_OUTSIDE_SCOPE'; end if;
 v_raw:=public.dabbir_platform_customer_360_v1(p_actor,p_target_user_id);
 select coalesce(access_scope->>'type','') into v_scope_type from public.dabbir_platform_admins where user_id=p_actor;
 if v_global then return v_raw; end if;
 select coalesce(jsonb_agg(x.value),'[]'::jsonb) into v_businesses from jsonb_array_elements(coalesce(v_raw->'businesses','[]'::jsonb)) x where dabbir_private.platform_scope_allows_business(p_actor,nullif(x.value->>'id','')::uuid);
 select coalesce(jsonb_agg(x.value),'[]'::jsonb) into v_support from jsonb_array_elements(coalesce(v_raw->'support','[]'::jsonb)) x where nullif(x.value->>'business_id','') is not null and dabbir_private.platform_scope_allows_business(p_actor,(x.value->>'business_id')::uuid);
 select coalesce(jsonb_agg(x.value),'[]'::jsonb) into v_incidents from jsonb_array_elements(coalesce(v_raw->'incidents','[]'::jsonb)) x where nullif(x.value->>'business_id','') is not null and dabbir_private.platform_scope_allows_business(p_actor,(x.value->>'business_id')::uuid);
 select coalesce(jsonb_agg(x.value),'[]'::jsonb) into v_audit from jsonb_array_elements(coalesce(v_raw->'audit_history','[]'::jsonb)) x where nullif(x.value->>'target_business_id','') is not null and dabbir_private.platform_scope_allows_business(p_actor,(x.value->>'target_business_id')::uuid);
 return jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(v_raw,'{businesses}',v_businesses,true),'{support}',v_support,true),'{incidents}',v_incidents,true),'{audit_history}',v_audit,true),'{payments}','[]'::jsonb,true),'{feedback}','[]'::jsonb,true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.dabbir_platform_feedback_list_v1(p_actor uuid, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth', 'dabbir_private'
AS $function$
declare v_result jsonb;
begin
  if not dabbir_private.platform_effective_capability(p_actor,'customers.view') then raise exception 'DABBIR_PLATFORM_CAPABILITY_REQUIRED:customers.view'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',f.id,'user_id',f.user_id,'customer_no',ua.customer_no,'email',u.email,'business_id',f.business_id,
    'business_name',b.name,'rating',f.rating,'feedback',f.message,'screen_feature',coalesce(f.feature,f.context->>'screen',f.context->>'feature'),
    'type',coalesce(f.feedback_type,f.category),'category',f.category,'date',f.created_at,'frequency',f.frequency,
    'status',f.status,'linked_entity_type',f.linked_entity_type,'linked_entity_id',f.linked_entity_id
  ) order by f.created_at desc),'[]'::jsonb)
  into v_result
  from (
    select * from public.dabbir_feedback where dabbir_private.platform_scope_is_global(p_actor) or dabbir_private.platform_scope_allows_business(p_actor,business_id) order by created_at desc limit least(greatest(coalesce(p_limit,100),1),200)
  ) f
  left join public.dabbir_user_accounts ua on ua.user_id=f.user_id
  left join auth.users u on u.id=f.user_id
  left join public.dabbir_businesses b on b.id=f.business_id;
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.dabbir_platform_support_action_v2(p_actor uuid, p_action text, p_case_id uuid DEFAULT NULL::uuid, p_target_user_id uuid DEFAULT NULL::uuid, p_customer_no text DEFAULT NULL::text, p_business_id uuid DEFAULT NULL::uuid, p_category text DEFAULT NULL::text, p_priority text DEFAULT NULL::text, p_subject text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_diagnostic text DEFAULT NULL::text, p_resolution text DEFAULT NULL::text, p_sla_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dabbir_private'
AS $function$
declare v_action text:=upper(trim(coalesce(p_action,''))); v_id uuid; v_case dabbir_private.platform_customer_support_cases%rowtype; v_global boolean;
begin
  perform dabbir_private.platform_assert_permission(p_actor,'manage_support');
  if not dabbir_private.platform_effective_capability(p_actor,case when v_action='UPDATE' and (nullif(trim(p_status),'') is not null or nullif(trim(p_resolution),'') is not null) then 'support.close' else 'support.reply' end) then raise exception 'DABBIR_SUPPORT_CAPABILITY_REQUIRED'; end if;
  v_global:=dabbir_private.platform_scope_is_global(p_actor);
  if v_action='CREATE' then
    if p_target_user_id is null or nullif(trim(p_customer_no),'') is null or nullif(trim(p_subject),'') is null then raise exception 'DABBIR_SUPPORT_CREATE_INVALID'; end if;
    if not exists(select 1 from public.dabbir_user_accounts where user_id=p_target_user_id and customer_no=upper(trim(p_customer_no))) then raise exception 'DABBIR_SUPPORT_CUSTOMER_MISMATCH'; end if;
    if p_business_id is not null and not exists(select 1 from public.dabbir_memberships where user_id=p_target_user_id and business_id=p_business_id and status='active') then raise exception 'DABBIR_SUPPORT_BUSINESS_MISMATCH'; end if;
    if not v_global then perform dabbir_private.platform_assert_business_scope(p_actor,p_business_id); end if;
    insert into dabbir_private.platform_customer_support_cases(target_user_id,customer_no,business_id,category,priority,status,subject,created_by,assigned_to,sla_due_at,diagnostic)
    values(p_target_user_id,upper(trim(p_customer_no)),p_business_id,coalesce(nullif(trim(p_category),''),'general'),coalesce(nullif(trim(p_priority),''),'normal'),'open',left(trim(p_subject),240),p_actor,p_actor,p_sla_due_at,nullif(trim(p_diagnostic),'')) returning id into v_id;
    if nullif(trim(coalesce(p_note,'')),'') is not null then insert into dabbir_private.platform_customer_support_notes(case_id,actor_user_id,note) values(v_id,p_actor,left(trim(p_note),4000)); end if;
  else
    if p_case_id is null then raise exception 'DABBIR_SUPPORT_CASE_REQUIRED'; end if;
    select * into v_case from dabbir_private.platform_customer_support_cases where id=p_case_id for update;
    if not found then raise exception 'DABBIR_SUPPORT_CASE_NOT_FOUND'; end if;
    if not v_global then perform dabbir_private.platform_assert_business_scope(p_actor,v_case.business_id); end if;
    v_id:=p_case_id;
    if v_action='ADD_NOTE' then
      if nullif(trim(coalesce(p_note,'')),'') is null then raise exception 'DABBIR_SUPPORT_NOTE_REQUIRED'; end if;
      insert into dabbir_private.platform_customer_support_notes(case_id,actor_user_id,note) values(v_id,p_actor,left(trim(p_note),4000));
      update dabbir_private.platform_customer_support_cases set updated_at=now() where id=v_id;
    elsif v_action='UPDATE' then
      update dabbir_private.platform_customer_support_cases set
        priority=coalesce(nullif(trim(p_priority),''),priority),status=coalesce(nullif(trim(p_status),''),status),diagnostic=coalesce(nullif(trim(p_diagnostic),''),diagnostic),resolution=coalesce(nullif(trim(p_resolution),''),resolution),sla_due_at=coalesce(p_sla_due_at,sla_due_at),resolved_at=case when lower(coalesce(nullif(trim(p_status),''),status)) in('resolved','closed') then coalesce(resolved_at,now()) else null end,updated_at=now()
      where id=v_id;
      if nullif(trim(coalesce(p_note,'')),'') is not null then insert into dabbir_private.platform_customer_support_notes(case_id,actor_user_id,note) values(v_id,p_actor,left(trim(p_note),4000)); end if;
    else raise exception 'DABBIR_SUPPORT_ACTION_INVALID'; end if;
  end if;
  insert into dabbir_private.platform_staff_audit(actor_user_id,action,reason,result,metadata)
  values(p_actor,'SUPPORT_'||v_action,'support center mutation','SUCCESS',jsonb_build_object('case_id',v_id,'customer_no',p_customer_no,'scope_enforced',true));
  return jsonb_build_object('case_id',v_id,'action',v_action,'result','SUCCESS');
end;
$function$;

CREATE OR REPLACE FUNCTION public.dabbir_ceo_commands_authorized_v1(p_actor uuid, p_limit integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dabbir_private'
AS $function$ begin if not dabbir_private.platform_scope_is_global(p_actor) then raise exception 'DABBIR_GLOBAL_SCOPE_REQUIRED'; end if; if not dabbir_private.platform_effective_capability(p_actor,'ceo.view') then raise exception 'DABBIR_CEO_CAPABILITY_REQUIRED'; end if; return to_jsonb(public.dabbir_ceo_commands_recent_v2(p_limit)); end $function$;

CREATE OR REPLACE FUNCTION public.dabbir_ceo_command_create_authorized_v1(p_actor uuid, p_command_text text, p_priority text, p_objective text, p_acceptance_criteria jsonb, p_due_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dabbir_private'
AS $function$
begin
  if not dabbir_private.platform_scope_is_global(p_actor) then raise exception 'DABBIR_GLOBAL_SCOPE_REQUIRED'; end if; if not dabbir_private.platform_effective_capability(p_actor,'ceo.create') then raise exception 'DABBIR_CEO_CAPABILITY_REQUIRED'; end if;
  return public.dabbir_ceo_command_create_v2(p_actor,p_command_text,p_priority,p_objective,coalesce(p_acceptance_criteria,'[]'::jsonb),p_due_at);
end;$function$;

CREATE OR REPLACE FUNCTION public.dabbir_ceo_command_update_authorized_v1(p_actor uuid, p_command_id uuid, p_operation text, p_priority text, p_due_at timestamp with time zone, p_guidance text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dabbir_private'
AS $function$ begin if not dabbir_private.platform_scope_is_global(p_actor) then raise exception 'DABBIR_GLOBAL_SCOPE_REQUIRED'; end if; if not dabbir_private.platform_effective_capability(p_actor,'ceo.update') then raise exception 'DABBIR_CEO_CAPABILITY_REQUIRED'; end if; return to_jsonb(public.dabbir_ceo_command_update_v2(p_actor,p_command_id,p_operation,p_priority,p_due_at,p_guidance)); end $function$;

CREATE OR REPLACE FUNCTION public.dabbir_platform_audit_list_v1(p_actor uuid,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','dabbir_private'
AS $function$
declare v_result jsonb; v_global boolean;
begin
 if not dabbir_private.platform_effective_capability(p_actor,'audit.view') then raise exception 'DABBIR_PLATFORM_CAPABILITY_REQUIRED:audit.view'; end if;
 v_global:=dabbir_private.platform_scope_is_global(p_actor);
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_result from (
  select * from (
   select 'staff'::text source,id,created_at,actor_user_id,action,result,reason,metadata
    from dabbir_private.platform_staff_audit where v_global or actor_user_id=p_actor
   union all
   select 'operations',id,created_at,actor_user_id,action,outcome,reason,jsonb_build_object('business_id',business_id,'entity_id',entity_id,'entity_type',entity_type)
    from public.dabbir_platform_owner_audit where v_global or dabbir_private.platform_scope_allows_business(p_actor,business_id)
   union all
   select 'customer_admin',id,created_at,actor_user_id,action,'RECORDED',null::text,details
    from dabbir_private.platform_customer_admin_audit where v_global or actor_user_id=p_actor
  ) entries order by created_at desc limit least(greatest(coalesce(p_limit,100),1),300)
 ) x;
 return v_result;
end;
$function$;

revoke all on function public.dabbir_platform_command_center_overview_v1(uuid) from public,anon,authenticated;
revoke all on function public.dabbir_platform_customer_360_scoped_v2(uuid,uuid) from public,anon,authenticated;
revoke all on function public.dabbir_platform_feedback_list_v1(uuid,integer) from public,anon,authenticated;
revoke all on function public.dabbir_platform_audit_list_v1(uuid,integer) from public,anon,authenticated;
grant execute on function public.dabbir_platform_command_center_overview_v1(uuid),public.dabbir_platform_customer_360_scoped_v2(uuid,uuid),public.dabbir_platform_feedback_list_v1(uuid,integer),public.dabbir_platform_audit_list_v1(uuid,integer) to service_role;
revoke all on function public.dabbir_platform_support_action_v2(uuid,text,uuid,uuid,text,uuid,text,text,text,text,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.dabbir_ceo_commands_authorized_v1(uuid,integer) from public,anon,authenticated;
revoke all on function public.dabbir_ceo_command_create_authorized_v1(uuid,text,text,text,jsonb,timestamptz) from public,anon,authenticated;
revoke all on function public.dabbir_ceo_command_update_authorized_v1(uuid,uuid,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.dabbir_platform_support_action_v2(uuid,text,uuid,uuid,text,uuid,text,text,text,text,text,text,text,timestamptz),public.dabbir_ceo_commands_authorized_v1(uuid,integer),public.dabbir_ceo_command_create_authorized_v1(uuid,text,text,text,jsonb,timestamptz),public.dabbir_ceo_command_update_authorized_v1(uuid,uuid,text,text,timestamptz,text) to service_role;
