-- DABBIR customer naming v2
-- Close the exposed authenticated SECURITY DEFINER surface. The web API verifies the
-- signed-in owner/admin and then calls this service-role-only RPC with the exact actor id.

drop function if exists public.dabbir_customer_update_display_name(uuid,uuid,text);

create or replace function public.dabbir_customer_update_display_name(
  p_actor_user_id uuid,
  p_business_id uuid,
  p_customer_id uuid,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_name text:=left(trim(pg_catalog.regexp_replace(coalesce(p_display_name,''),'[[:cntrl:]]+',' ','g')),120);
  v_customer public.dabbir_customers%rowtype;
begin
  if coalesce((select auth.role()),'')<>'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';
  end if;
  if p_actor_user_id is null or p_business_id is null or p_customer_id is null then
    raise exception 'CUSTOMER_CONTEXT_REQUIRED' using errcode='22023';
  end if;
  if nullif(v_name,'') is null then
    raise exception 'CUSTOMER_NAME_REQUIRED' using errcode='22023';
  end if;

  if not exists (
    select 1 from auth.users u
    where u.id=p_actor_user_id and u.deleted_at is null
      and (u.banned_until is null or u.banned_until<=pg_catalog.now())
  ) then raise exception 'CUSTOMER_NAME_ACTOR_INACTIVE' using errcode='42501'; end if;

  if not exists (
    select 1 from public.dabbir_memberships m
    where m.business_id=p_business_id and m.user_id=p_actor_user_id and m.status='active'
      and m.suspended_at is null and m.removed_at is null
      and m.role in ('owner','admin')
  ) then raise exception 'CUSTOMER_NAME_OWNER_REQUIRED' using errcode='42501'; end if;

  select * into v_customer
  from public.dabbir_customers c
  where c.id=p_customer_id and c.business_id=p_business_id
  for update;
  if not found then raise exception 'CUSTOMER_NOT_FOUND' using errcode='P0002'; end if;

  update public.dabbir_customers c
  set display_name=v_name,
      display_name_source='owner',
      owner_display_name_updated_at=pg_catalog.now(),
      metadata=coalesce(c.metadata,'{}'::jsonb)||pg_catalog.jsonb_build_object(
        'display_name_owner_override',true,
        'display_name_owner_override_at',pg_catalog.now(),
        'display_name_owner_actor',p_actor_user_id
      ),
      updated_at=pg_catalog.now()
  where c.id=p_customer_id and c.business_id=p_business_id
  returning * into v_customer;

  return pg_catalog.jsonb_build_object(
    'id',v_customer.id,
    'business_id',v_customer.business_id,
    'display_name',v_customer.display_name,
    'whatsapp_display_name',v_customer.whatsapp_display_name,
    'display_name_source',v_customer.display_name_source,
    'owner_display_name_updated_at',v_customer.owner_display_name_updated_at,
    'updated_at',v_customer.updated_at
  );
end;
$function$;

revoke all on function public.dabbir_customer_update_display_name(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.dabbir_customer_update_display_name(uuid,uuid,uuid,text) to service_role;
