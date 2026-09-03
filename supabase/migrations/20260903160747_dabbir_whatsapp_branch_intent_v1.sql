create table if not exists public.dabbir_whatsapp_branch_intents(
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  branch_id uuid not null,
  expires_at timestamptz not null default (now()+interval '10 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(business_id,user_id),
  constraint dabbir_whatsapp_branch_intents_branch_business_fkey
    foreign key(branch_id,business_id)
    references public.dabbir_business_branches(id,business_id)
    on delete cascade
);

create index if not exists dabbir_whatsapp_branch_intents_expiry_idx
  on public.dabbir_whatsapp_branch_intents(expires_at);
create index if not exists dabbir_whatsapp_branch_intents_branch_business_fk_idx
  on public.dabbir_whatsapp_branch_intents(branch_id,business_id);

alter table public.dabbir_whatsapp_branch_intents enable row level security;
alter table public.dabbir_whatsapp_branch_intents force row level security;
revoke all on public.dabbir_whatsapp_branch_intents from public,anon;
grant select,insert,update,delete on public.dabbir_whatsapp_branch_intents to authenticated;

drop policy if exists dabbir_whatsapp_branch_intents_select on public.dabbir_whatsapp_branch_intents;
create policy dabbir_whatsapp_branch_intents_select on public.dabbir_whatsapp_branch_intents
for select to authenticated
using (
  user_id=(select auth.uid())
  and dabbir_private.has_permission(business_id,'manage_business')
  and dabbir_private.branch_access_allowed(business_id,branch_id)
);

drop policy if exists dabbir_whatsapp_branch_intents_insert on public.dabbir_whatsapp_branch_intents;
create policy dabbir_whatsapp_branch_intents_insert on public.dabbir_whatsapp_branch_intents
for insert to authenticated
with check (
  user_id=(select auth.uid())
  and dabbir_private.has_permission(business_id,'manage_business')
  and dabbir_private.branch_access_allowed(business_id,branch_id)
  and expires_at>now()
  and expires_at<=now()+interval '15 minutes'
);

drop policy if exists dabbir_whatsapp_branch_intents_update on public.dabbir_whatsapp_branch_intents;
create policy dabbir_whatsapp_branch_intents_update on public.dabbir_whatsapp_branch_intents
for update to authenticated
using (
  user_id=(select auth.uid())
  and dabbir_private.has_permission(business_id,'manage_business')
)
with check (
  user_id=(select auth.uid())
  and dabbir_private.has_permission(business_id,'manage_business')
  and dabbir_private.branch_access_allowed(business_id,branch_id)
  and expires_at>now()
  and expires_at<=now()+interval '15 minutes'
);

drop policy if exists dabbir_whatsapp_branch_intents_delete on public.dabbir_whatsapp_branch_intents;
create policy dabbir_whatsapp_branch_intents_delete on public.dabbir_whatsapp_branch_intents
for delete to authenticated
using (
  user_id=(select auth.uid())
  and dabbir_private.has_permission(business_id,'manage_business')
);

create or replace function public.dabbir_whatsapp_upsert_connection(
  p_business_id uuid,p_provider text,p_status text,p_meta_app_id text,p_waba_id text,
  p_phone_number_id text,p_display_phone_number text,p_verified_name text,
  p_access_token_ciphertext text,p_access_token_iv text,p_access_token_tag text,
  p_token_expires_at timestamptz,p_token_key_version text,p_connected_by uuid,
  p_connected_at timestamptz,p_last_verified_at timestamptz,p_last_provider_status integer,p_last_error text
)
returns setof public.dabbir_whatsapp_connections
language plpgsql
security invoker
set search_path = pg_catalog, public, dabbir_private, auth
as $$
declare
  v_row public.dabbir_whatsapp_connections%rowtype;
  v_uid uuid := (select auth.uid());
  v_phone_owner uuid;
  v_branch_id uuid;
begin
  if v_uid is null then raise exception 'WHATSAPP_CONNECTION_AUTH_REQUIRED' using errcode='42501'; end if;
  if p_business_id is null or nullif(trim(p_waba_id),'') is null or nullif(trim(p_phone_number_id),'') is null then
    raise exception 'WHATSAPP_CONNECTION_REQUIRED_FIELDS' using errcode='22023';
  end if;
  if p_connected_by is distinct from v_uid then raise exception 'WHATSAPP_CONNECTION_ACTOR_MISMATCH' using errcode='42501'; end if;
  if not dabbir_private.is_active_member(p_business_id)
     or not exists (
       select 1 from public.dabbir_memberships m
       where m.business_id=p_business_id and m.user_id=v_uid and m.status='active'
         and m.suspended_at is null and m.removed_at is null
         and m.role=any(array['owner'::text,'admin'::text])
     ) then raise exception 'WHATSAPP_CONNECTION_OWNER_REQUIRED' using errcode='42501'; end if;

  select i.branch_id into v_branch_id
  from public.dabbir_whatsapp_branch_intents i
  where i.business_id=p_business_id and i.user_id=v_uid and i.expires_at>now()
    and exists(
      select 1 from public.dabbir_business_branches b
      where b.id=i.branch_id and b.business_id=i.business_id and b.status='active'
    )
  order by i.updated_at desc limit 1;

  if v_branch_id is null then v_branch_id:=dabbir_private.primary_branch_for_business(p_business_id); end if;
  if v_branch_id is null then raise exception 'DABBIR_ACTIVE_BRANCH_REQUIRED'; end if;

  select c.business_id into v_phone_owner
  from public.dabbir_whatsapp_connections c
  where c.phone_number_id=trim(p_phone_number_id)
    and not (c.business_id=p_business_id and c.branch_id=v_branch_id)
  limit 1;
  if v_phone_owner is not null then raise exception 'WHATSAPP_PHONE_ALREADY_CONNECTED' using errcode='23505'; end if;

  begin
    insert into public.dabbir_whatsapp_connections(
      business_id,branch_id,provider,status,meta_app_id,waba_id,phone_number_id,
      display_phone_number,verified_name,access_token_ciphertext,access_token_iv,
      access_token_tag,token_expires_at,token_key_version,connected_by,connected_at,
      last_verified_at,last_provider_status,last_error,updated_at
    ) values (
      p_business_id,v_branch_id,coalesce(nullif(trim(p_provider),''),'meta'),
      coalesce(nullif(trim(p_status),''),'connected'),nullif(trim(p_meta_app_id),''),
      trim(p_waba_id),trim(p_phone_number_id),nullif(trim(p_display_phone_number),''),
      nullif(trim(p_verified_name),''),p_access_token_ciphertext,p_access_token_iv,
      p_access_token_tag,p_token_expires_at,coalesce(nullif(trim(p_token_key_version),''),'whatsapp_v1'),
      p_connected_by,coalesce(p_connected_at,now()),p_last_verified_at,p_last_provider_status,p_last_error,now()
    )
    on conflict (business_id,branch_id) do update set
      provider=excluded.provider,status=excluded.status,meta_app_id=excluded.meta_app_id,
      waba_id=excluded.waba_id,phone_number_id=excluded.phone_number_id,
      display_phone_number=excluded.display_phone_number,verified_name=excluded.verified_name,
      access_token_ciphertext=excluded.access_token_ciphertext,access_token_iv=excluded.access_token_iv,
      access_token_tag=excluded.access_token_tag,token_expires_at=excluded.token_expires_at,
      token_key_version=excluded.token_key_version,connected_by=excluded.connected_by,
      connected_at=excluded.connected_at,last_verified_at=excluded.last_verified_at,
      last_provider_status=excluded.last_provider_status,last_error=excluded.last_error,updated_at=now()
    returning * into v_row;
  exception when unique_violation then
    raise exception 'WHATSAPP_PHONE_ALREADY_CONNECTED' using errcode='23505';
  end;

  delete from public.dabbir_whatsapp_branch_intents i
  where i.business_id=p_business_id and i.user_id=v_uid;

  return next v_row;
end;
$$;

revoke all on function public.dabbir_whatsapp_upsert_connection(uuid,text,text,text,text,text,text,text,text,text,text,timestamptz,text,uuid,timestamptz,timestamptz,integer,text) from public,anon;
grant execute on function public.dabbir_whatsapp_upsert_connection(uuid,text,text,text,text,text,text,text,text,text,text,timestamptz,text,uuid,timestamptz,timestamptz,integer,text) to authenticated,service_role;
