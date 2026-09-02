begin;

revoke all privileges on table public.migration_auth_users_stage from public, anon, authenticated;
revoke all privileges on table public.migration_auth_identities_stage from public, anon, authenticated;
revoke all privileges on table public.migration_auth_mfa_factors_stage from public, anon, authenticated;

alter table public.migration_auth_users_stage enable row level security;
alter table public.migration_auth_identities_stage enable row level security;
alter table public.migration_auth_mfa_factors_stage enable row level security;

comment on table public.migration_auth_users_stage is
  'Internal DABBIR Auth migration staging. Not accessible to anon/authenticated.';
comment on table public.migration_auth_identities_stage is
  'Internal DABBIR Auth identity migration staging. Not accessible to anon/authenticated.';
comment on table public.migration_auth_mfa_factors_stage is
  'Internal DABBIR MFA migration staging. Not accessible to anon/authenticated.';

commit;
