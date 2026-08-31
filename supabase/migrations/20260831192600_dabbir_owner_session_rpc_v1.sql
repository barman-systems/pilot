begin;

create or replace function public.dabbir_owner_session_issue_v1(
  p_actor_user_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog','public','dabbir_private'
as $$
begin
  if p_actor_user_id is null or nullif(trim(p_token_hash),'') is null or p_expires_at <= now() then
    raise exception 'INVALID_OWNER_SESSION';
  end if;
  if not exists(select 1 from public.dabbir_platform_admins where user_id=p_actor_user_id and active=true) then
    raise exception 'PLATFORM_ADMIN_REQUIRED';
  end if;
  delete from dabbir_private.owner_sessions where expires_at <= now() or revoked_at is not null;
  insert into dabbir_private.owner_sessions(actor_user_id,token_hash,expires_at,last_seen_at)
  values(p_actor_user_id,p_token_hash,p_expires_at,now());
end;
$$;

create or replace function public.dabbir_owner_session_verify_v1(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','dabbir_private'
as $$
declare
  v_session dabbir_private.owner_sessions%rowtype;
begin
  select * into v_session
  from dabbir_private.owner_sessions
  where token_hash=p_token_hash
    and revoked_at is null
    and expires_at>now()
  limit 1;
  if not found then
    return jsonb_build_object('authenticated',false);
  end if;
  if not exists(select 1 from public.dabbir_platform_admins where user_id=v_session.actor_user_id and active=true) then
    update dabbir_private.owner_sessions set revoked_at=now() where id=v_session.id;
    return jsonb_build_object('authenticated',false);
  end if;
  update dabbir_private.owner_sessions set last_seen_at=now() where id=v_session.id;
  return jsonb_build_object(
    'authenticated',true,
    'role','platform_owner',
    'actor_user_id',v_session.actor_user_id,
    'expires_at',v_session.expires_at
  );
end;
$$;

revoke all on function public.dabbir_owner_session_issue_v1(uuid,text,timestamptz) from public, anon, authenticated;
revoke all on function public.dabbir_owner_session_verify_v1(text) from public, anon, authenticated;
grant execute on function public.dabbir_owner_session_issue_v1(uuid,text,timestamptz) to service_role;
grant execute on function public.dabbir_owner_session_verify_v1(text) to service_role;

commit;
