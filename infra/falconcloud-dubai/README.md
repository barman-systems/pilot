# DABBIR | دبّر — Falconcloud Dubai migration

This directory prepares DABBIR for a dedicated self-hosted Supabase runtime on a Falconcloud VM in Dubai. It intentionally **does not** migrate the whole shared Supabase project.

## Target

- Falconcloud / Equinix DX1, Dubai
- Ubuntu 24.04 LTS x86_64
- Minimum production target: 4 vCPU, 8 GB RAM, 160 GB SSD
- Docker-based self-hosted Supabase
- PostgreSQL 17
- HTTPS through Caddy
- Vercel Functions cut over to `dxb1` only after the database/runtime passes every gate

## Source boundary verified 2026-09-01

The current managed Supabase project is shared with other systems. DABBIR's isolated migration boundary is:

- 123 DABBIR base tables
- 56 DABBIR Auth users and 56 identities
- 26 MFA factors
- 2 DABBIR Storage buckets / 1 current object
- 2 DABBIR-owned Edge Functions
- 12 unrelated Auth users excluded
- unrelated ZAJEL/R&A/Barman tables, storage and Edge Functions excluded

## Execution order

1. Provision the clean Dubai VM.
2. Point the chosen DABBIR API hostname to its public IP.
3. Clone this repository on the VM.
4. Run `bootstrap.sh` with `DABBIR_DB_DOMAIN` and `DABBIR_APP_URL` set.
5. Run `verify.sh`; any failure blocks migration.
6. Run `migrate-db.sh` with source/target Postgres URLs.
7. Run `migrate-storage.sh` with source/target service credentials.
8. Run `deploy-functions.sh`.
9. Run application smoke tests against the Dubai endpoint while Production still points to the old source.
10. Merge the region-only Vercel cutover (`dxb1`) and switch DABBIR endpoint/key environment variables.
11. Verify the deployed Vercel runtime actually reports `dxb1` and run production smoke tests.

See `CUTOVER.md` for the authoritative stop/go gates.

## Security rules

- Never commit database passwords, service-role keys, JWT secrets, SMTP credentials or provider API keys.
- DB port 5432 and gateway port 8000 are not public internet ports.
- Temporary Auth export files are mode 600 and removed automatically after migration execution.
- Only DABBIR-owned Storage policies and Edge Functions are moved.
- The old Supabase project is rollback-only after a successful cutover; it is not an accepted long-term DABBIR dependency.
