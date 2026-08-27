-- DABBIR visible customer/account number v1
-- Canonical identity stays auth.users.id (UUID). This creates a stable human-facing DAB-* number only for DABBIR users.

create sequence if not exists dabbir_private.dabbir_customer_number_seq
  as bigint
  start with 100001
  increment by 1
  minvalue 100001
  no maxvalue
  no cycle;

revoke all on sequence dabbir_private.dabbir_customer_number_seq from public, anon, authenticated;

create or replace function dabbir_private.next_customer_number()
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_no bigint;
begin
  v_no := nextval('dabbir_private.dabbir_customer_number_seq');
  return 'DAB-' || v_no::text;
end;
$function$;
revoke all on function dabbir_private.next_customer_number() from public, anon, authenticated;
grant execute on function dabbir_private.next_customer_number() to service_role;

create table if not exists public.dabbir_user_accounts (
  user_id uuid primary key references auth.users(id) on delete restrict,
  customer_no text not null default dabbir_private.next_customer_number(),
  created_at timestamptz not null default now(),
  constraint dabbir_user_accounts_customer_no_key unique (customer_no),
  constraint dabbir_user_accounts_customer_no_format check (customer_no ~ '^DAB-[0-9]{6,}$')
);

comment on table public.dabbir_user_accounts is
  'One immutable human-facing DABBIR customer/account number per registered DABBIR user. user_id UUID remains the canonical internal identity.';
comment on column public.dabbir_user_accounts.user_id is
  'Canonical DABBIR user UUID from auth.users.id.';
comment on column public.dabbir_user_accounts.customer_no is
  'Stable support-facing customer number such as DAB-100245. Never use as the database primary identity.';

create or replace function dabbir_private.guard_dabbir_user_account_identity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'DABBIR_CUSTOMER_NUMBER_DELETE_FORBIDDEN';
  end if;
  if new.user_id is distinct from old.user_id
     or new.customer_no is distinct from old.customer_no
     or new.created_at is distinct from old.created_at then
    raise exception 'DABBIR_CUSTOMER_NUMBER_IMMUTABLE';
  end if;
  return new;
end;
$function$;
revoke all on function dabbir_private.guard_dabbir_user_account_identity() from public, anon, authenticated;

drop trigger if exists dabbir_guard_user_account_identity on public.dabbir_user_accounts;
create trigger dabbir_guard_user_account_identity
before update or delete on public.dabbir_user_accounts
for each row execute function dabbir_private.guard_dabbir_user_account_identity();

create or replace function dabbir_private.ensure_dabbir_user_account()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  insert into public.dabbir_user_accounts(user_id)
  values (new.user_id)
  on conflict (user_id) do nothing;
  return new;
end;
$function$;
revoke all on function dabbir_private.ensure_dabbir_user_account() from public, anon, authenticated;

drop trigger if exists dabbir_membership_ensure_customer_number on public.dabbir_memberships;
create trigger dabbir_membership_ensure_customer_number
after insert on public.dabbir_memberships
for each row execute function dabbir_private.ensure_dabbir_user_account();

-- Backfill only users who actually belong to DABBIR. Do not number ZAJEL-only/shared Auth users.
insert into public.dabbir_user_accounts(user_id)
select m.user_id
from public.dabbir_memberships m
left join public.dabbir_user_accounts a on a.user_id = m.user_id
where a.user_id is null
group by m.user_id
order by min(m.created_at), m.user_id
on conflict (user_id) do nothing;

alter table public.dabbir_user_accounts enable row level security;
alter table public.dabbir_user_accounts force row level security;
revoke all on public.dabbir_user_accounts from public, anon, authenticated;
grant select on public.dabbir_user_accounts to authenticated;
grant select, insert, update, delete on public.dabbir_user_accounts to service_role;

drop policy if exists dabbir_user_accounts_select_own on public.dabbir_user_accounts;
create policy dabbir_user_accounts_select_own
on public.dabbir_user_accounts
for select
to authenticated
using (user_id = (select auth.uid()));

create or replace function dabbir_private.resolve_customer_number(p_customer_no text)
returns table (
  customer_no text,
  user_id uuid,
  business_id uuid,
  business_name text,
  membership_role text,
  membership_status text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select a.customer_no,
         a.user_id,
         m.business_id,
         b.name as business_name,
         m.role::text as membership_role,
         m.status::text as membership_status
  from public.dabbir_user_accounts a
  left join public.dabbir_memberships m on m.user_id = a.user_id
  left join public.dabbir_businesses b on b.id = m.business_id
  where a.customer_no = upper(trim(p_customer_no));
$function$;
revoke all on function dabbir_private.resolve_customer_number(text) from public, anon, authenticated;
grant execute on function dabbir_private.resolve_customer_number(text) to service_role;
