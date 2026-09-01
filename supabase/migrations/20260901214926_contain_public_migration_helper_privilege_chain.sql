begin;

revoke all privileges
  on table public.migration_auth_fk_specs
  from public, anon, authenticated;

alter table public.migration_auth_fk_specs enable row level security;

revoke execute
  on function public.migration_apply_auth_fks_v1()
  from public, anon, authenticated;

grant select
  on table public.migration_auth_fk_specs
  to service_role;

grant execute
  on function public.migration_apply_auth_fks_v1()
  to service_role;

comment on table public.migration_auth_fk_specs is
  'Internal DABBIR migration metadata. Not accessible to anon/authenticated.';

comment on function public.migration_apply_auth_fks_v1() is
  'Internal DABBIR migration helper. Execution restricted to service_role and privileged database roles.';

commit;
