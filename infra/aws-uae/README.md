# DABBIR AWS UAE infrastructure — RETIRED

**Status: RETIRED / historical reference only.** DABBIR production remains on the Vercel + Supabase path. There is **no active AWS deployment authority** in the repository after the P0-A decommission change. The templates and migration notes below are retained only as historical/reference material and must not be treated as a Production direction or executable authority.

GitHub OIDC is customized to an immutable workflow-bound subject format, so the historical AWS role trust on the former environment-only subject no longer matches tokens minted by this repository. Reintroducing AWS execution requires a new, separately reviewed architecture/security decision; do not revive retired workflows or the old role path.

---

# Historical DABBIR managed UAE infrastructure

This directory contains the former AWS UAE migration path for DABBIR.

## Historical production direction

DABBIR previously evaluated moving to managed AWS services in `me-central-1` so the owner would not maintain an operating system, PostgreSQL server, Docker host, disks, or manual backups. That migration path is no longer active.

Historical foundation:

- `dabbir-managed-foundation.yml`
- former `.github/workflows/dabbir-aws-uae-foundation.yml` (retired)
- `github-oidc-bootstrap.yml`
- `verify-dabbir-migration.sh`

The previous `dabbir-uae.yml` + `bootstrap-dabbir-supabase.sh` EC2/self-hosted design is also historical only.

## Managed foundation reference

The historical foundation described:

- VPC in AWS UAE
- two public application subnets across two Availability Zones
- two private database subnets across two Availability Zones
- Amazon RDS for PostgreSQL 17 with AWS-managed master password
- encrypted storage and 14-day automated backups
- deletion protection and final snapshots
- Amazon S3 with encryption, versioning, and blocked public access
- Amazon ECR repositories for the DABBIR API and Supabase-compatible runtime images
- Amazon ECS cluster for Fargate
- CloudWatch runtime log group
- security groups that keep PostgreSQL private

These are not current DABBIR Production authorities.

## Historical source audit baseline — 2026-09-01

The migration work had expected at least:

- 123 DABBIR runtime tables, including the hidden `account_access_state` dependency
- 184 DABBIR functions
- 205 RLS policies
- 90 triggers
- 56 DABBIR auth users
- 56 auth identities
- 26 MFA factors

The source database was PostgreSQL 17.6 and the planned managed foundation targeted RDS PostgreSQL 17.11.

## Supabase compatibility findings

These findings are retained as historical engineering notes only. DABBIR production continues to use its current Vercel/Supabase contracts unless a future separately approved migration changes that architecture.

## Safety

Do not deploy any AWS template from this directory as part of normal DABBIR operations. AWS workflows and OIDC execution paths were retired by P0-A. Historical cloud resources, if retained outside the repository, are not a DABBIR runtime authority and require a separate explicit owner action for destructive deletion.
