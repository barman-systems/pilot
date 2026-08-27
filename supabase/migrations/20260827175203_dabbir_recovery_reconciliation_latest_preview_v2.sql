create or replace function public.dabbir_platform_support_ensure_latest_recovery_reconciliation(
  p_actor_user_id uuid,
  p_customer_no text,
  p_business_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_target uuid;
  v_no text;
  v_target_at timestamptz;
begin
  perform dabbir_private.platform_assert_admin(p_actor_user_id);
  v_no := upper(trim(coalesce(p_customer_no,'')));
  select a.user_id into v_target
  from public.dabbir_user_accounts a
  where a.customer_no=v_no;
  if v_target is null then raise exception 'DABBIR_CUSTOMER_ACCOUNT_NOT_FOUND'; end if;
  if p_business_id is null or not exists(
    select 1 from public.dabbir_memberships m
    where m.user_id=v_target and m.business_id=p_business_id
  ) then raise exception 'DABBIR_CUSTOMER_BUSINESS_MISMATCH'; end if;

  select (a.details->>'target_at')::timestamptz into v_target_at
  from dabbir_private.platform_customer_admin_audit a
  where a.actor_user_id=p_actor_user_id
    and a.target_user_id=v_target
    and a.target_business_id=p_business_id
    and a.action='recovery_preview'
    and a.created_at >= clock_timestamp() - interval '30 minutes'
    and a.details ? 'target_at'
  order by a.created_at desc
  limit 1;

  if v_target_at is null then raise exception 'DABBIR_RECOVERY_PREVIEW_REQUIRED'; end if;
  return public.dabbir_platform_support_ensure_recovery_reconciliation(
    p_actor_user_id,v_no,p_business_id,v_target_at
  );
end;
$function$;

revoke all on function public.dabbir_platform_support_ensure_latest_recovery_reconciliation(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.dabbir_platform_support_ensure_latest_recovery_reconciliation(uuid,text,uuid) to service_role;
