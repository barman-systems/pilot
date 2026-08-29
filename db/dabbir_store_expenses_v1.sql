-- Small-store expense ledger for owner/admin operations.
-- Reads and writes remain business-scoped through the existing permission helper.

create table if not exists public.dabbir_expenses(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  amount_aed numeric(12,2) not null check(amount_aed > 0 and amount_aed <= 10000000),
  category text not null check(category in ('rent','utilities','supplies','salaries','marketing','transport','other')),
  note text not null default '' check(char_length(note) <= 240),
  occurred_on date not null default (timezone('Asia/Dubai', now())::date),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dabbir_expenses_business_date_idx
  on public.dabbir_expenses(business_id, occurred_on desc, created_at desc);

alter table public.dabbir_expenses enable row level security;
alter table public.dabbir_expenses force row level security;

revoke all on public.dabbir_expenses from anon;
revoke all on public.dabbir_expenses from public;
grant select, insert on public.dabbir_expenses to authenticated;

 drop policy if exists dabbir_expenses_select on public.dabbir_expenses;
create policy dabbir_expenses_select on public.dabbir_expenses
  for select to authenticated
  using (dabbir_private.has_permission(business_id,'view_analytics'));

 drop policy if exists dabbir_expenses_insert on public.dabbir_expenses;
create policy dabbir_expenses_insert on public.dabbir_expenses
  for insert to authenticated
  with check (dabbir_private.has_permission(business_id,'manage_business') and created_by = auth.uid());

revoke all on table public.dabbir_expenses from public, anon;
grant select, insert on table public.dabbir_expenses to authenticated;
