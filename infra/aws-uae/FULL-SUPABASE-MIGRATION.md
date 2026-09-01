# DABBIR full Supabase-to-AWS migration — authoritative

## Final state

After production cutover DABBIR must have **zero runtime dependency on Supabase Cloud**.

Production runtime:

- Vercel: public web frontend only.
- AWS `me-central-1`: all DABBIR backend/runtime services.
- Amazon RDS PostgreSQL 17: DABBIR database and Supabase-compatible schemas.
- ECS Fargate: Supabase Auth (GoTrue), PostgREST, Realtime, Storage API, Edge Runtime / DABBIR webhook workers, and API gateway.
- Amazon S3: Storage backend.
- AWS Secrets Manager: application/runtime secrets.
- CloudWatch: logs, alarms, runtime visibility.
- AWS-managed backups/snapshots plus an out-of-region backup copy.

Supabase Cloud project `spohjzrsymsmzsseygtw` remains a migration source/rollback source only during the cutover window. It is not an allowed steady-state production dependency for DABBIR.

## What moves

### Database

Move DABBIR-only database state, not unrelated Barman/ZAJEL/RA state:

- `dabbir_private` schema
- all `public.dabbir*` relations/functions/sequences/views
- `public.account_access_state`
- RLS policies
- triggers
- indexes
- required grants
- required PostgreSQL extensions/capabilities that are supported on the managed target

The migration gate must compare source and target schema definitions and all DABBIR table data before cutover.

### Auth

Move DABBIR identities to the self-hosted Auth service in AWS:

- `auth.users` rows belonging to DABBIR users, including password hashes needed for password sign-in
- `auth.identities` rows belonging to DABBIR users
- MFA factors belonging to DABBIR users
- provider metadata required by DABBIR sign-in methods

Do **not** migrate unrelated auth users from the shared source project.

Active sessions/refresh-token state is transient and is not a cutover requirement. A one-time re-login is acceptable and safer than copying stale sessions. Accounts, password hashes, identities and MFA enrollment must be preserved.

### REST / Data API

Run PostgREST in ECS Fargate against the UAE RDS database and preserve the Supabase-compatible `/rest/v1` contract used by DABBIR.

### Realtime

Run Supabase Realtime in ECS Fargate against UAE RDS. RDS must be configured for logical replication before enabling Realtime. Realtime is not allowed to depend on the old Supabase project after cutover.

### Storage

Run Supabase Storage API in ECS Fargate with Amazon S3 as its backend. Migrate DABBIR-owned storage metadata and objects only. Do not copy unrelated project buckets/objects into the DABBIR account.

### Edge Functions and webhooks

DABBIR-owned Supabase Edge Functions/webhooks move to the AWS runtime (Edge Runtime or native DABBIR Fargate API workers). Shared Barman/ZAJEL functions are not moved as part of DABBIR and must not be modified by this migration.

Known DABBIR functions currently requiring migration include the active DABBIR-specific functions discovered from the source project, including `dabbir-owner-broker` and `dabbir-salon-reminder-worker`. The migration inventory must be regenerated immediately before cutover because functions can change.

### Secrets

Move DABBIR runtime secrets to AWS Secrets Manager. Do not commit secret values to GitHub and do not create long-lived AWS access keys for application administration.

## Compatibility

DABBIR application configuration may keep separate `SUPABASE_AUTH_URL` and `SUPABASE_DATA_URL` variables during migration, but after final cutover both must resolve to the AWS-hosted DABBIR endpoint. This separation exists only to make staged migration/rollback safe.

## Cutover gates

Cutover is forbidden unless all of these pass:

1. RDS source/target DABBIR schema and data gate passes.
2. DABBIR Auth accounts, identities and MFA counts/fingerprints pass.
3. Password login works against AWS Auth for a migrated test account.
4. REST/RPC calls pass against AWS PostgREST with RLS enforced.
5. Realtime subscription test passes if any production DABBIR path uses Realtime.
6. Storage upload/download/delete tests pass through AWS Storage API and the object exists in S3.
7. Each DABBIR Edge Function/webhook has a passing AWS equivalent.
8. No production DABBIR configuration points at `*.supabase.co`.
9. Vercel production smoke test passes after endpoint switch.
10. Rollback endpoint/configuration is recorded before changing production traffic.

## No mixed steady state

A long-term split where Auth stays on Supabase Cloud while data moves to AWS is explicitly rejected. Temporary dual-running is permitted only during migration verification and rollback window.
