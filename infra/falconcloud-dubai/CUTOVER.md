# DABBIR Dubai cutover gate

Production stays on the current Supabase/Vercel path until every gate below passes.

1. Falconcloud VM exists in Dubai / Equinix DX1 with >=4 vCPU, >=8 GB RAM, >=160 GB SSD, Ubuntu 24.04 LTS x86_64.
2. `bootstrap.sh` completes and `verify.sh` passes.
3. A dedicated DABBIR API hostname resolves to the Dubai VM and HTTPS is valid.
4. `migrate-db.sh` migrates **DABBIR-only** database state and the 56 DABBIR Auth identities; unrelated shared-project state is excluded.
5. Password hashes, identities and enrolled MFA factors are preserved; sessions/refresh tokens are intentionally not copied, so one re-login is acceptable.
6. `migrate-storage.sh` migrates only DABBIR buckets, object bytes and DABBIR-specific Storage RLS policies with byte-level SHA-256 verification.
7. `deploy-functions.sh` deploys only `dabbir-owner-broker` and `dabbir-salon-reminder-worker`; unrelated ZAJEL/Barman functions are not copied.
8. Source-target schema/data fingerprints, all DABBIR table rows, Auth fingerprints, RLS, triggers, grants and sequence states pass the strict verifier.
9. DABBIR API/Auth/booking/owner-dashboard smoke tests pass against the target without changing production traffic.
10. Only then switch Vercel functions to `dxb1` (Dubai), replace DABBIR production Supabase/Auth/Data endpoints and keys, and run post-cutover smoke tests.
11. Keep the old managed Supabase project available only as rollback during the cutover window.
12. If any post-cutover gate fails, revert endpoint/region configuration immediately.

## Verified source snapshot — 2026-09-01

Shared managed source project:

- Ref: `spohjzrsymsmzsseygtw`
- Region: `ap-southeast-2` (Sydney)
- PostgreSQL: 17.6
- Whole shared database size: 698 MB
- Whole shared Auth users: 68

DABBIR migration boundary:

- DABBIR base tables: 123
- DABBIR Auth users: 56
- DABBIR Auth identities: 56
- DABBIR enrolled MFA factors: 26
- Unrelated Auth users excluded: 12
- DABBIR Storage buckets: 2
- DABBIR Storage objects: 1
- DABBIR-specific Storage RLS policies currently discovered: 1
- DABBIR-owned active Edge Functions: 2 (`dabbir-owner-broker`, `dabbir-salon-reminder-worker`)

## Vercel correction

The repository production configuration currently contains `"regions": ["dub1"]`; `dub1` is Dublin, Ireland. Dubai is `dxb1`. A region-only cutover branch is staged but must not be merged before the Dubai database/runtime endpoint is live and verified.

The currently inspected production deployment itself reported runtime region `syd1` (Sydney), so the cutover must verify the final deployed runtime reports `dxb1`, not merely that the repository file changed.
