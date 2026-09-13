alter table public.dabbir_whatsapp_connections
  add column if not exists token_context_id uuid;

update public.dabbir_whatsapp_connections
set token_context_id = business_id
where token_context_id is null;

alter table public.dabbir_whatsapp_connections
  alter column token_context_id set not null;

comment on column public.dabbir_whatsapp_connections.token_context_id is
  'Immutable cryptographic tenant context used to derive the WhatsApp access-token encryption key. It intentionally survives operational business/branch reassignment.';

create or replace function dabbir_private.guard_whatsapp_token_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    new.token_context_id := coalesce(new.token_context_id, new.business_id);
  elsif new.token_context_id is distinct from old.token_context_id then
    raise exception 'WHATSAPP_TOKEN_CONTEXT_IMMUTABLE' using errcode='23514';
  end if;
  return new;
end;
$function$;

revoke all on function dabbir_private.guard_whatsapp_token_context() from public, anon, authenticated;

drop trigger if exists dabbir_whatsapp_token_context_guard on public.dabbir_whatsapp_connections;
create trigger dabbir_whatsapp_token_context_guard
before insert or update of token_context_id on public.dabbir_whatsapp_connections
for each row execute function dabbir_private.guard_whatsapp_token_context();
