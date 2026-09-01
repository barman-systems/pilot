# DABBIR managed UAE infrastructure

This directory contains the AWS UAE migration path for DABBIR.

## Authoritative production direction

DABBIR is moving to managed AWS services in `me-central-1` so the owner does not maintain an operating system, PostgreSQL server, Docker host, disks, or manual backups.

Authoritative foundation:

- `dabbir-managed-foundation.yml`
- `.github/workflows/dabbir-aws-uae-foundation.yml`
- `github-oidc-bootstrap.yml`
- `verify-dabbir-migration.sh`

The previous `dabbir-uae.yml` + `bootstrap-dabbir-supabase.sh` EC2/self-hosted design is retained only as historical rollback/reference material. Do not deploy it for the managed production path.

## Managed foundation

The foundation creates:

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

No EC2 instance, SSH key, Elastic IP, or manually maintained Linux host is part of the managed foundation.

## Current source audit baseline — 2026-09-01

The migration gate currently expects at least:

- 123 DABBIR runtime tables, including the hidden `account_access_state` dependency
- 184 DABBIR functions
- 205 RLS policies
- 90 triggers
- 56 DABBIR auth users
- 56 auth identities
- 26 MFA factors

The source database is PostgreSQL 17.6. The new managed foundation defaults to RDS PostgreSQL 17.11, staying on the same major version while avoiding a new deployment on an older minor release.

## Supabase compatibility findings

DABBIR does not currently use Supabase Realtime channels in the repository, so Realtime is not a day-one migration requirement.

Runtime database code does not depend on `pg_net` or `pgmq`. One QA-only function (`dabbir_qa_consume_protected_share`) reads Supabase Vault. The managed target must preserve the function contract while removing its Vault dependency and externalizing the secret to AWS Secrets Manager.

The application does depend heavily on the Supabase-compatible Auth and REST contracts (`/auth/v1`, `/rest/v1`) and has a Storage helper (`/storage/v1`). The runtime migration must preserve those contracts before `SUPABASE_URL` is switched.

## Deployment safety

The foundation workflow is manual (`workflow_dispatch`) so infrastructure cannot start billing because of an ordinary code push.

AWS access is through GitHub OIDC and the production environment role. Do not store AWS access keys in GitHub or source code.

The final cutover is blocked until `verify-dabbir-migration.sh` passes against source and target databases.
