-- Root fix for WhatsApp Embedded Signup persistence.
-- The API previously used a PostgREST upsert directly against an RLS-protected
-- table. This RPC keeps the same tenant boundary but performs the ownership
-- check explicitly and makes the business_id conflict target deterministic.

create or replace function public.dabbir_whatsapp_upsert_connection(
  p_business_id uuid,
  p_provider text,
  p_status text,
  p_meta_app_id text,
  p_waba_id text,
  p_phone_number_id text,
  p_display_phone_number text,
  p_verified_name text,
  p_access_token_ciphertext text,
  p_access_token_iv text,
  p_access_token_tag text,
  p_token_expires_at timestamptz,
  p_token_key_version text,
  p_connected_by uuid,
  p_connected_at timestamptz,
  p_last_verified_at timestamptz,
  p_last_provider_status integer,
  p_last_error text
)
returns setof public.dabbir_whatsapp_connections
language plpgsql
security definer
set search_path = pg_catalog, public, dabbir_private, auth
as $$
declare
  v_row public.dabbir_whatsapp_connections%rowtype;
  v_uid uuid := (select auth.uid());
  v_phone_owner uuid;
begin
  if v_uid is null then
    raise exception 'WHATSAPP_CONNECTION_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_business_id is null or p_waba_id is null or nullif(trim(p_waba_id), '') is null
     or p_phone_number_id is null or nullif(trim(p_phone_number_id), '') is null then
    raise exception 'WHATSAPP_CONNECTION_REQUIRED_FIELDS' using errcode = '22023';
  end if;

  if p_connected_by is distinct from v_uid then
    raise exception 'WHATSAPP_CONNECTION_ACTOR_MISMATCH' using errcode = '42501';
  end if;

  if not dabbir_private.is_active_member(p_business_id)
     or not exists (
       select 1
       from public.dabbir_memberships m
       where m.business_id = p_business_id
         and m.user_id = v_uid
         and m.status = 'active'
         and m.suspended_at is null
         and m.removed_at is null
         and m.role = any (array['owner'::text, 'admin'::text])
     ) then
    raise exception 'WHATSAPP_CONNECTION_OWNER_REQUIRED' using errcode = '42501';
  end if;

  select c.business_id into v_phone_owner
  from public.dabbir_whatsapp_connections c
  where c.phone_number_id = trim(p_phone_number_id)
    and c.business_id <> p_business_id
  limit 1;

  if v_phone_owner is not null then
    raise exception 'WHATSAPP_PHONE_ALREADY_CONNECTED' using errcode = '23505';
  end if;

  begin
    insert into public.dabbir_whatsapp_connections (
      business_id, provider, status, meta_app_id, waba_id, phone_number_id,
      display_phone_number, verified_name, access_token_ciphertext,
      access_token_iv, access_token_tag, token_expires_at, token_key_version,
      connected_by, connected_at, last_verified_at, last_provider_status, last_error,
      updated_at
    ) values (
      p_business_id, coalesce(nullif(trim(p_provider), ''), 'meta'),
      coalesce(nullif(trim(p_status), ''), 'connected'),
      nullif(trim(p_meta_app_id), ''), trim(p_waba_id), trim(p_phone_number_id),
      nullif(trim(p_display_phone_number), ''), nullif(trim(p_verified_name), ''),
      p_access_token_ciphertext, p_access_token_iv, p_access_token_tag,
      p_token_expires_at, coalesce(nullif(trim(p_token_key_version), ''), 'whatsapp_v1'),
      p_connected_by, coalesce(p_connected_at, now()), p_last_verified_at,
      p_last_provider_status, p_last_error, now()
    )
    on conflict (business_id) do update set
      provider = excluded.provider,
      status = excluded.status,
      meta_app_id = excluded.meta_app_id,
      waba_id = excluded.waba_id,
      phone_number_id = excluded.phone_number_id,
      display_phone_number = excluded.display_phone_number,
      verified_name = excluded.verified_name,
      access_token_ciphertext = excluded.access_token_ciphertext,
      access_token_iv = excluded.access_token_iv,
      access_token_tag = excluded.access_token_tag,
      token_expires_at = excluded.token_expires_at,
      token_key_version = excluded.token_key_version,
      connected_by = excluded.connected_by,
      connected_at = excluded.connected_at,
      last_verified_at = excluded.last_verified_at,
      last_provider_status = excluded.last_provider_status,
      last_error = excluded.last_error,
      updated_at = now()
    returning * into v_row;
  exception when unique_violation then
    raise exception 'WHATSAPP_PHONE_ALREADY_CONNECTED' using errcode = '23505';
  end;

  return next v_row;
end;
$$;

revoke all on function public.dabbir_whatsapp_upsert_connection(
  uuid,text,text,text,text,text,text,text,text,text,text,timestamptz,text,uuid,timestamptz,timestamptz,integer,text
) from public, anon;
grant execute on function public.dabbir_whatsapp_upsert_connection(
  uuid,text,text,text,text,text,text,text,text,text,text,timestamptz,text,uuid,timestamptz,timestamptz,integer,text
) to authenticated;
