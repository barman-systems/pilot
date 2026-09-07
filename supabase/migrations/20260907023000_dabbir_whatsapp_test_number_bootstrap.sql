-- One-time, fail-closed bootstrap for Meta's platform test number.
-- This does not weaken normal Embedded Signup. It only converts an active,
-- expiring WhatsApp sandbox token into a tenant-scoped encrypted connection.

create or replace function public.dabbir_whatsapp_test_bootstrap_claim(
  p_token_hash text,
  p_platform_phone_number_id text
)
returns table(session_id uuid,business_id uuid,platform_phone_number_id text)
language plpgsql
security definer
set search_path to 'pg_catalog','public','auth'
as $function$
declare
  v_session public.dabbir_whatsapp_sandbox_sessions%rowtype;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';
  end if;
  if coalesce(p_token_hash,'') !~ '^[0-9a-f]{64}$' or nullif(trim(p_platform_phone_number_id),'') is null then
    raise exception 'WHATSAPP_TEST_BOOTSTRAP_INPUT_INVALID';
  end if;

  select s.* into v_session
  from public.dabbir_whatsapp_sandbox_sessions s
  where s.token_hash=lower(p_token_hash)
    and s.platform_phone_number_id=trim(p_platform_phone_number_id)
    and s.status in ('ACTIVE','BOUND')
    and s.expires_at>now()
  limit 1;

  if not found then raise exception 'WHATSAPP_TEST_BOOTSTRAP_SESSION_NOT_FOUND'; end if;
  if exists(select 1 from public.dabbir_whatsapp_connections c where c.phone_number_id=trim(p_platform_phone_number_id) and c.business_id<>v_session.business_id) then
    raise exception 'WHATSAPP_PHONE_ALREADY_CONNECTED';
  end if;

  return query select v_session.id,v_session.business_id,v_session.platform_phone_number_id;
end;
$function$;

create or replace function public.dabbir_whatsapp_test_bootstrap_store(
  p_token_hash text,
  p_platform_phone_number_id text,
  p_meta_app_id text,
  p_waba_id text,
  p_display_phone_number text,
  p_verified_name text,
  p_access_token_ciphertext text,
  p_access_token_iv text,
  p_access_token_tag text,
  p_token_key_version text,
  p_last_provider_status integer
)
returns table(connection_id uuid,business_id uuid,branch_id uuid,phone_number_id text,status text)
language plpgsql
security definer
set search_path to 'pg_catalog','public','auth','dabbir_private'
as $function$
declare
  v_session public.dabbir_whatsapp_sandbox_sessions%rowtype;
  v_branch_id uuid;
  v_row public.dabbir_whatsapp_connections%rowtype;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';
  end if;
  if coalesce(p_token_hash,'') !~ '^[0-9a-f]{64}$'
     or nullif(trim(p_platform_phone_number_id),'') is null
     or nullif(trim(p_waba_id),'') is null
     or nullif(p_access_token_ciphertext,'') is null
     or nullif(p_access_token_iv,'') is null
     or nullif(p_access_token_tag,'') is null then
    raise exception 'WHATSAPP_TEST_BOOTSTRAP_INPUT_INVALID';
  end if;

  select s.* into v_session
  from public.dabbir_whatsapp_sandbox_sessions s
  where s.token_hash=lower(p_token_hash)
    and s.platform_phone_number_id=trim(p_platform_phone_number_id)
    and s.status in ('ACTIVE','BOUND')
    and s.expires_at>now()
  for update
  limit 1;
  if not found then raise exception 'WHATSAPP_TEST_BOOTSTRAP_SESSION_NOT_FOUND'; end if;

  v_branch_id:=dabbir_private.primary_branch_for_business(v_session.business_id);
  if v_branch_id is null then raise exception 'DABBIR_ACTIVE_BRANCH_REQUIRED'; end if;

  if exists(
    select 1 from public.dabbir_whatsapp_connections c
    where c.phone_number_id=trim(p_platform_phone_number_id)
      and not (c.business_id=v_session.business_id and c.branch_id=v_branch_id)
  ) then raise exception 'WHATSAPP_PHONE_ALREADY_CONNECTED'; end if;

  insert into public.dabbir_whatsapp_connections(
    business_id,branch_id,provider,status,meta_app_id,waba_id,phone_number_id,
    display_phone_number,verified_name,access_token_ciphertext,access_token_iv,
    access_token_tag,token_key_version,connected_by,connected_at,last_verified_at,
    last_provider_status,last_error,updated_at
  ) values (
    v_session.business_id,v_branch_id,'meta','connected',nullif(trim(p_meta_app_id),''),
    trim(p_waba_id),trim(p_platform_phone_number_id),nullif(trim(p_display_phone_number),''),
    nullif(trim(p_verified_name),''),p_access_token_ciphertext,p_access_token_iv,p_access_token_tag,
    coalesce(nullif(trim(p_token_key_version),''),'whatsapp_v1'),null,now(),now(),
    p_last_provider_status,null,now()
  )
  on conflict (business_id,branch_id) do update set
    provider='meta',status='connected',meta_app_id=excluded.meta_app_id,waba_id=excluded.waba_id,
    phone_number_id=excluded.phone_number_id,display_phone_number=excluded.display_phone_number,
    verified_name=excluded.verified_name,access_token_ciphertext=excluded.access_token_ciphertext,
    access_token_iv=excluded.access_token_iv,access_token_tag=excluded.access_token_tag,
    token_key_version=excluded.token_key_version,connected_by=null,connected_at=now(),
    last_verified_at=now(),last_provider_status=excluded.last_provider_status,last_error=null,updated_at=now()
  returning * into v_row;

  update public.dabbir_whatsapp_sandbox_sessions
  set status='REVOKED',updated_at=now()
  where id=v_session.id;

  return query select v_row.id,v_row.business_id,v_row.branch_id,v_row.phone_number_id,v_row.status;
end;
$function$;

revoke all on function public.dabbir_whatsapp_test_bootstrap_claim(text,text) from public,anon,authenticated;
revoke all on function public.dabbir_whatsapp_test_bootstrap_store(text,text,text,text,text,text,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_test_bootstrap_claim(text,text) to service_role;
grant execute on function public.dabbir_whatsapp_test_bootstrap_store(text,text,text,text,text,text,text,text,text,text,integer) to service_role;
