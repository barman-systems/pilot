alter table dabbir_private.platform_customer_support_cases
  add column if not exists source_key text;

create unique index if not exists platform_customer_support_cases_source_key_uidx
  on dabbir_private.platform_customer_support_cases(source_key)
  where source_key is not null;

create or replace function public.dabbir_platform_support_ensure_recovery_reconciliation(
  p_actor_user_id uuid,
  p_customer_no text,
  p_business_id uuid,
  p_target_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_target uuid;
  v_no text;
  v_preview jsonb;
  v_source_key text;
  v_case_id uuid;
  v_created boolean := false;
  v_note text;
begin
  perform dabbir_private.platform_assert_admin(p_actor_user_id);
  v_no := upper(trim(coalesce(p_customer_no,'')));
  select a.user_id into v_target
  from public.dabbir_user_accounts a
  where a.customer_no = v_no;
  if v_target is null then raise exception 'DABBIR_CUSTOMER_ACCOUNT_NOT_FOUND'; end if;
  if p_business_id is null or not exists(
    select 1 from public.dabbir_memberships m
    where m.user_id=v_target and m.business_id=p_business_id
  ) then raise exception 'DABBIR_CUSTOMER_BUSINESS_MISMATCH'; end if;

  v_preview := dabbir_private.recovery_preview(p_business_id,p_target_at,null);
  if coalesce((v_preview->>'reconciliation_events')::bigint,0) <= 0
     or coalesce((v_preview->>'auto_restore_ready')::boolean,false) then
    raise exception 'DABBIR_RECOVERY_RECONCILIATION_NOT_REQUIRED';
  end if;

  v_source_key := 'recovery-reconcile:' || pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'customer_no',v_no,
      'business_id',p_business_id,
      'target_at',p_target_at,
      'reconciliation_events',v_preview->'reconciliation_events',
      'reconciliation_tables',v_preview->'reconciliation_tables'
    )::text
  );

  v_note := left(
    'Automatic recovery was blocked by fail-closed safety policy. ' ||
    'Target: ' || p_target_at::text || '. ' ||
    'Total events: ' || coalesce(v_preview->>'events_to_reverse','0') || '. ' ||
    'Safe automatic events: ' || coalesce(v_preview->>'auto_restore_events','0') || '. ' ||
    'Manual reconciliation events: ' || coalesce(v_preview->>'reconciliation_events','0') || '. ' ||
    'Reconciliation tables: ' || coalesce((v_preview->'reconciliation_tables')::text,'{}') || '. ' ||
    'No external provider action or partial recovery was executed.',
    4000
  );

  insert into dabbir_private.platform_customer_support_cases(
    target_user_id,customer_no,business_id,category,priority,status,subject,created_by,assigned_to,source_key
  ) values(
    v_target,v_no,p_business_id,'recovery','high','open','Recovery reconciliation required',p_actor_user_id,p_actor_user_id,v_source_key
  )
  on conflict (source_key) where source_key is not null do nothing
  returning id into v_case_id;

  if v_case_id is not null then
    v_created := true;
    insert into dabbir_private.platform_customer_support_notes(case_id,actor_user_id,note)
    values(v_case_id,p_actor_user_id,v_note);
  else
    select c.id into v_case_id
    from dabbir_private.platform_customer_support_cases c
    where c.source_key=v_source_key;
  end if;

  insert into dabbir_private.platform_customer_admin_audit(
    actor_user_id,action,target_user_id,target_business_id,details
  ) values(
    p_actor_user_id,'recovery_reconciliation_case_ensured',v_target,p_business_id,
    pg_catalog.jsonb_build_object(
      'case_id',v_case_id,
      'created',v_created,
      'target_at',p_target_at,
      'reconciliation_events',v_preview->'reconciliation_events'
    )
  );

  return pg_catalog.jsonb_build_object(
    'case_id',v_case_id,
    'created',v_created,
    'source_key',v_source_key,
    'reconciliation_events',v_preview->'reconciliation_events',
    'reconciliation_tables',v_preview->'reconciliation_tables'
  );
end;
$function$;

revoke all on function public.dabbir_platform_support_ensure_recovery_reconciliation(uuid,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.dabbir_platform_support_ensure_recovery_reconciliation(uuid,text,uuid,timestamptz) to service_role;