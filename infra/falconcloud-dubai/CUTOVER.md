# DABBIR Dubai cutover gate

Production must remain on the current Supabase/Vercel path until all of the following are true:

1. Falconcloud VM is provisioned in Dubai / Equinix DX1 with >=4 vCPU, >=8 GB RAM and >=160 GB SSD.
2. `bootstrap.sh` completes and `verify.sh` passes.
3. A dedicated DNS hostname (for example `db.dabbir.bmalman.com`) resolves to the Dubai VM and HTTPS is valid.
4. The source Supabase database is exported with the Supabase CLI using the official self-hosted restore procedure. Raw `pg_dump` of the full managed cluster is not accepted.
5. Database, Auth records, Storage metadata, and the three current Storage objects are verified on the target.
6. Source and target verification evidence match for DABBIR key tables and Auth users.
7. DABBIR API/Auth/booking/owner dashboard smoke tests pass against the target without changing production traffic.
8. Only then change Vercel function region from the incorrect `dub1` (Dublin) / current runtime location to `dxb1` (Dubai) and replace production Supabase endpoint/keys.
9. Keep the source Supabase project read-only/available for rollback during the cutover window.
10. If any post-cutover smoke test fails, revert Vercel env/region immediately to the recorded source values.

## Verified source snapshot — 2026-09-01

- Managed Supabase project ref: `spohjzrsymsmzsseygtw`
- Region: `ap-southeast-2` (Sydney)
- Postgres: 17.6
- Database size: 698 MB
- Auth users: 68
- Storage objects: 3 (48,040 bytes metadata total)
- Application tables: 226 in `public` + 15 in `dabbir_private`
- RLS: enabled on all 241 application tables
- Required extensions observed: `pg_cron`, `pg_net`, `pg_stat_statements`, `pgcrypto`, `pgmq`, `supabase_vault`, `uuid-ossp`

## Vercel correction

The repository currently uses `"regions": ["dub1"]`; `dub1` is Dublin, Ireland. Dubai is `dxb1`. Do not merge the region correction until the Dubai database endpoint is live, because Vercel guidance is to colocate functions with the database.
