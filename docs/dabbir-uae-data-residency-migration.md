# DABBIR UAE data-residency migration

Status: **in progress — safe pre-cutover phase**

## Source confirmed

- Supabase project: `Bm online trading` (`spohjzrsymsmzsseygtw`)
- Current Supabase region: `ap-southeast-2` (Sydney, Australia)
- Current database size: about **695 MB**
- The database is shared with non-DABBIR schemas and workloads.
- DABBIR-specific data is primarily in `public.dabbir_*` plus `dabbir_private`.

## Isolation audit (2026-08-31)

Live metadata inspection found:

- 111 DABBIR tables
- 161 RLS policies
- 86 non-internal triggers
- 178 DABBIR/public+DABBIR-private functions
- 415 indexes
- 54 DABBIR user accounts linked to 54 Auth users
- 29 DABBIR businesses
- 45 active/current membership rows total
- 1 DABBIR-named Storage bucket containing 1 object
- no DABBIR foreign key to an unrelated application table

Three `public.dabbir_source_control_*` functions reference `barman_control` / `barman_private`. They belong to the internal source-control/evolution control plane rather than the customer runtime. They must not drag the full Barman control plane into the UAE customer database; keep them excluded unless that control plane is deliberately separated later.

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
- Created isolated migration branch `infra/dabbir-uae-supabase` and PR #232.
- Added a Terraform AWS UAE foundation under `infra/aws-uae` with region lock, encrypted disk, private encrypted/versioned S3 backups, IMDSv2, SSM administration, and no public PostgreSQL ingress.
- Added a daily PostgreSQL backup timer for the future UAE host.
- Added `scripts/dabbir-uae-preflight.sql` for source/target object-count, FK-isolation, and dependency checks.
- Added a dedicated Terraform CI validation workflow.

## Remaining execution

### 1. Provision UAE infrastructure

Apply the prepared Terraform in AWS `me-central-1`, then install the pinned official Supabase self-hosted Docker stack with:

- encrypted storage at rest
- HTTPS-only public API endpoint
- PostgreSQL backup/restore policy
- database port not exposed publicly
- least-privilege IAM
- monitoring and alerting

### 2. Build and restore a DABBIR-only migration set

Export and restore:

- required `public.dabbir_*` tables
- `dabbir_private`
- required DABBIR functions, triggers, RLS policies, sequences, types and grants
- the 54 DABBIR-linked Auth identities required at cutover
- the DABBIR Storage bucket/object

Do **not** blindly restore the full 695 MB shared database.

### 3. Validate before cutover

Minimum gates:

- preflight object/dependency counts
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
- backup creation and test restore

### 4. Cut over

After the UAE target passes all gates:

- update production `SUPABASE_URL`
- update production `SUPABASE_PUBLISHABLE_KEY`
- update production server-side service-role key
- deploy
- run smoke tests
- verify writes land only in the UAE target
- keep the old project rollback-capable for the agreed safety window

## Current blocker

Live AWS resource creation cannot be completed from this chat until an AWS account/API connection with permission to provision `me-central-1` is available. No connected AWS plugin is currently available. The old Supabase production database remains unchanged and healthy while the safe pre-cutover work continues.
