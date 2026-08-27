-- DABBIR customer-number lookup RPC hardening v1
-- The caller already owns a self-only SELECT policy on dabbir_user_numbers, so
-- elevated execution is unnecessary. Run under caller RLS and remove anonymous RPC access.

alter table public.dabbir_user_numbers enable row level security;
alter table public.dabbir_user_numbers force row level security;

create or replace function public.dabbir_my_customer_no()
returns text
language sql
stable
security invoker
set search_path to 'public', 'auth'
as $function$
  select n.customer_no
  from public.dabbir_user_numbers n
  where n.user_id = auth.uid();
$function$;

revoke all on function public.dabbir_my_customer_no() from public, anon;
grant execute on function public.dabbir_my_customer_no() to authenticated, service_role;
