-- Owner edits are application truth, even when the underlying customer originated on WhatsApp.
-- The service RPC intentionally keeps source/provider metadata for provenance, so the provider
-- trigger must recognize the explicit owner override marker before applying provider-name logic.

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
  v_owner_override boolean :=
    tg_op='UPDATE'
    and new.display_name_source='owner'
    and coalesce(new.metadata->>'display_name_owner_override','false')='true';
  v_incoming text;
  v_legacy_manual boolean := false;
begin
  if not v_service_whatsapp then return new; end if;

  -- Explicit owner/admin edits always win. Do not reinterpret the owner's chosen name as
  -- a provider profile name merely because provenance metadata still says WhatsApp/Meta.
  if v_owner_override then
    new.whatsapp_display_name:=old.whatsapp_display_name;
    new.metadata:=coalesce(new.metadata,'{}'::jsonb)-'_dabbir_provider_display_name';
    return new;
  end if;

  v_incoming:=left(nullif(trim(new.metadata->>'_dabbir_provider_display_name'),''),120);
  new.metadata:=coalesce(new.metadata,'{}'::jsonb)-'_dabbir_provider_display_name';

  if v_incoming is null then
    if tg_op='INSERT' then
      v_incoming:=left(nullif(trim(new.display_name),''),120);
    elsif new.display_name is distinct from old.display_name then
      v_incoming:=left(nullif(trim(new.display_name),''),120);
    end if;
  end if;
  if v_incoming='WhatsApp Customer' then v_incoming:=null; end if;

  if v_incoming is not null then new.whatsapp_display_name:=v_incoming; end if;

  if tg_op='INSERT' then
    if new.whatsapp_display_name is not null then
      new.display_name_source:='whatsapp';
      if v_incoming is not null then new.display_name:=v_incoming; end if;
    end if;
    return new;
  end if;

  v_legacy_manual:=old.display_name_source='system'
    and old.channel_handle is null
    and old.phone_e164 is not null;

  if old.display_name_source='owner' then
    new.display_name:=old.display_name;
    new.display_name_source:='owner';
    new.owner_display_name_updated_at:=old.owner_display_name_updated_at;
  elsif v_legacy_manual then
    new.display_name:=old.display_name;
    new.display_name_source:='system';
  elsif v_incoming is not null then
    new.display_name:=v_incoming;
    new.display_name_source:='whatsapp';
  elsif old.display_name_source='whatsapp' then
    new.display_name_source:='whatsapp';
  end if;
  return new;
end;
$function$;

revoke all on function dabbir_private.guard_customer_whatsapp_display_name() from public,anon,authenticated;
