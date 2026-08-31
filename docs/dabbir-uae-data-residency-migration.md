# DABBIR UAE data-residency migration

Status: **in progress — safe pre-cutover phase**

## Source confirmed

- Supabase project: `Bm online trading` (`spohjzrsymsmzsseygtw`)
- Current Supabase region: `ap-southeast-2` (Sydney, Australia)
- Current database size: about **695 MB**
- The database is shared with non-DABBIR schemas and workloads.
- DABBIR-specific data is primarily in `public.dabbir_*` plus `dabbir_private`.

## Target

Run a **standalone DABBIR Supabase stack inside the UAE** on AWS region `me-central-1`.

Reason for self-hosting the Supabase stack instead of moving only PostgreSQL: DABBIR currently relies on Supabase Auth and the Supabase REST/Data API, not only raw PostgreSQL. Moving only the database would break authentication and API behavior.

## Migration guardrails

1. Do not modify or pause the current production Supabase project during provisioning.
2. Do not copy unrelated `barman_*`, `zajel_*`, governance, or other shared-project application data into the DABBIR UAE target unless a verified dependency requires it.
3. Preserve DABBIR RLS, triggers, functions, grants, auth identities, and storage objects required by DABBIR.
4. Perform a dry-run restore and regression tests before changing production environment variables.
5. Cut over by environment configuration (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, server-only service-role key) rather than by hard-coded project endpoints.
6. Keep a rollback path to the current Supabase endpoint until post-cutover verification passes.

## Work completed

- Confirmed the live source Supabase project and its actual region.
- Confirmed DABBIR is hosted in a shared database and should be separated rather than cloning the entire database.
- Parameterized the backend auth core so the Supabase endpoint and publishable key can be switched by environment variables without a code rewrite.
- Created this isolated migration branch: `infra/dabbir-uae-supabase`.

## Remaining execution

### 1. Provision UAE infrastructure

Provision the DABBIR Supabase runtime in AWS `me-central-1` with:

- encrypted storage at rest
- HTTPS-only public API endpoint
- PostgreSQL backups and point-in-time recovery/snapshot policy
- database port not exposed publicly
- least-privilege IAM
- monitoring and alerting

### 2. Build a DABBIR-only migration set

Export and restore:

- required `public.dabbir_*` tables
- `dabbir_private`
- required DABBIR functions, triggers, RLS policies, sequences, types and grants
- DABBIR-linked auth identities
- DABBIR-required Storage buckets/objects, if any

Do **not** blindly restore the full 695 MB shared database.

### 3. Validate before cutover

Minimum gates:

- login / refresh / logout
- owner account access and suspension guard
- cross-tenant isolation / RLS
- business creation and memberships
- customers, orders, inventory, bookings and appointments
- WhatsApp integration state
- Stripe billing state
- calendar connections
- owner/admin dashboard reads
- regression suite and load test

### 4. Cut over

After the UAE target passes all gates:

- update production `SUPABASE_URL`
- update production `SUPABASE_PUBLISHABLE_KEY`
- update production server-side service-role key
- deploy
- run smoke tests
- verify writes land only in the UAE target
- keep the old project read-only/rollback-capable for the agreed safety window

## Current blocker

Live provisioning cannot be completed from this chat until an AWS account connection/API with permission to create infrastructure in `me-central-1` is available. The current connected Supabase account cannot create a managed UAE-region Supabase project because UAE is not offered as a managed Supabase region.
