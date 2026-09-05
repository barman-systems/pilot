-- DABBIR owner temporary-access fail-closed session enforcement.
create or replace function public.dabbir_owner_session_verify_v1(p_token_hash text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','dabbir_private' as $$
declare v_session dabbir_private.owner_sessions%rowtype; v_admin public.dabbir_platform_admins%rowtype;
begin
  select * into v_session from dabbir_private.owner_sessions
  where token_hash=p_token_hash and revoked_at is null and expires_at>now() limit 1;
  if not found then return jsonb_build_object('authenticated',false); end if;

  select * into v_admin from public.dabbir_platform_admins
  where user_id=v_session.actor_user_id
    and active=true and revoked_at is null and suspended_at is null
    and role in ('ROOT_OWNER','OWNER_DELEGATE')
    and (access_expires_at is null or access_expires_at>now());

  if not found then
    update dabbir_private.owner_sessions set revoked_at=now() where id=v_session.id;
    return jsonb_build_object('authenticated',false);
  end if;

  update dabbir_private.owner_sessions set last_seen_at=now() where id=v_session.id;
  return jsonb_build_object(
    'authenticated',true,
    'role','platform_owner',
    'authority_role',v_admin.role,
    'root_owner',v_admin.role='ROOT_OWNER',
    'permissions',case when v_admin.role='ROOT_OWNER' then to_jsonb(array[
      'manage_customers','manage_businesses','manage_orders','manage_bookings','manage_products','manage_services','manage_support','manage_incidents','manage_integrations','manage_employees','manage_system','manage_releases','manage_ceo_commands','view_financials','manage_financial_operations'
    ]::text[]) else to_jsonb(v_admin.permissions) end,
    'display_name',v_admin.display_name,
    'actor_user_id',v_session.actor_user_id,
    'expires_at',v_session.expires_at,
    'access_expires_at',v_admin.access_expires_at,
    'access_scope',v_admin.access_scope,
    'mfa_required',v_admin.mfa_required,
    'approval_limit_aed',v_admin.approval_limit_aed
  );
end;
$$;
revoke all on function public.dabbir_owner_session_verify_v1(text) from anon, authenticated;
grant execute on function public.dabbir_owner_session_verify_v1(text) to service_role;
