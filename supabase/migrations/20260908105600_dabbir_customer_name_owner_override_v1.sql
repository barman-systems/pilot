-- DABBIR customer naming v1
-- Owner/admin names are canonical once explicitly edited. WhatsApp profile/contact names
-- continue to sync as secondary provider truth without overwriting the owner's chosen name.

alter table public.dabbir_customers
  add column if not exists whatsapp_display_name text,
  add column if not exists display_name_source text not null default 'system',
  add column if not exists owner_display_name_updated_at timestamptz;

do $block$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='dabbir_customers_whatsapp_display_name_len'
      and conrelid='public.dabbir_customers'::regclass
  ) then
    alter table public.dabbir_customers
      add constraint dabbir_customers_whatsapp_display_name_len
      check (whatsapp_display_name is null or char_length(whatsapp_display_name) between 1 and 120);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='dabbir_customers_display_name_source_check'
      and conrelid='public.dabbir_customers'::regclass
  ) then
    alter table public.dabbir_customers
      add constraint dabbir_customers_display_name_source_check
      check (display_name_source in ('system','whatsapp','owner'));
  end if;
end
$block$;

update public.dabbir_customers
set whatsapp_display_name=left(display_name,120),
    display_name_source='whatsapp'
where channel_handle is not null
  and coalesce(metadata->>'source','')='whatsapp'
  and nullif(trim(display_name),'') is not null
  and display_name<>'WhatsApp Customer'
  and display_name_source='system';

create or replace function dabbir_private.guard_customer_whatsapp_display_name()
returns trigger
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $function$
declare
  v_service_whatsapp boolean :=
    coalesce(auth.role(),'')='service_role'
    and coalesce(new.metadata->>'source','')='whatsapp'
    and coalesce(new.metadata->>'provider','')='meta';
  v_incoming text;
begin
  if not v_service_whatsapp then return new; end if;

  v_incoming:=left(nullif(trim(new.display_name),''),120);
  if v_incoming is not null and v_incoming<>'WhatsApp Customer' then
    new.whatsapp_display_name:=v_incoming;
  end if;

  if tg_op='INSERT' then
    if new.whatsapp_display_name is not null then
      new.display_name_source:='whatsapp';
    end if;
    return new;
  end if;

  if old.display_name_source='owner' then
    new.display_name:=old.display_name;
    new.display_name_source:='owner';
    new.owner_display_name_updated_at:=old.owner_display_name_updated_at;
  elsif new.whatsapp_display_name is not null then
    new.display_name_source:='whatsapp';
  end if;
  return new;
end;
$function$;

revoke all on function dabbir_private.guard_customer_whatsapp_display_name() from public,anon,authenticated;

drop trigger if exists dabbir_customer_whatsapp_display_name_guard on public.dabbir_customers;
create trigger dabbir_customer_whatsapp_display_name_guard
before insert or update of display_name,metadata on public.dabbir_customers
for each row execute function dabbir_private.guard_customer_whatsapp_display_name();

create or replace function public.dabbir_customer_update_display_name(
  p_business_id uuid,
  p_customer_id uuid,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','dabbir_private','auth'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_name text:=left(trim(regexp_replace(coalesce(p_display_name,''),'[[:cntrl:]]+',' ','g')),120);
  v_customer public.dabbir_customers%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_business_id is null or p_customer_id is null then raise exception 'CUSTOMER_CONTEXT_REQUIRED' using errcode='22023'; end if;
  if nullif(v_name,'') is null then raise exception 'CUSTOMER_NAME_REQUIRED' using errcode='22023'; end if;

  if not exists (
    select 1 from public.dabbir_memberships m
    where m.business_id=p_business_id and m.user_id=v_uid and m.status='active'
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
      owner_display_name_updated_at=now(),
      metadata=coalesce(c.metadata,'{}'::jsonb)||jsonb_build_object(
        'display_name_owner_override',true,
        'display_name_owner_override_at',now()
      ),
      updated_at=now()
  where c.id=p_customer_id and c.business_id=p_business_id
  returning * into v_customer;

  return jsonb_build_object(
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

revoke all on function public.dabbir_customer_update_display_name(uuid,uuid,text) from public,anon;
grant execute on function public.dabbir_customer_update_display_name(uuid,uuid,text) to authenticated;
