# DABBIR AWS UAE infrastructure

This Terraform root creates the **pre-cutover foundation** for a standalone DABBIR Supabase host in AWS `me-central-1` (UAE).

## Security defaults

- Region is hard-locked to `me-central-1`.
- PostgreSQL ports are not present in the public security group.
- Only HTTP/HTTPS are publicly reachable; HTTP is reserved for redirect/ACME.
- SSH is disabled after bootstrap; use AWS Systems Manager Session Manager.
- EC2 root storage is encrypted.
- Backups land in a private, encrypted, versioned S3 bucket in the same AWS region.
- Instance metadata requires IMDSv2.
- Detailed EC2 monitoring is enabled.

## Capacity baseline

Default host: `t3.xlarge` (4 vCPU / 16 GB RAM), 100 GB encrypted gp3. This is deliberately above the current Supabase self-host minimum/recommended memory baseline and can be changed before apply.

## What this does not do automatically

It does not perform a live cutover. The target Supabase Docker stack, TLS hostname, generated secrets, DABBIR-only restore, and application environment switch are intentionally separate gates so production cannot be redirected to an empty or unverified database.

## Required apply identity

Use GitHub OIDC -> AWS IAM role rather than storing long-lived AWS keys. The role needs least-privilege permission for the resources in this Terraform root. No AWS credential should be committed to this repository.

## Safe execution order

1. `terraform init && terraform validate`
2. `terraform plan`
3. Apply in AWS UAE.
4. Point a dedicated DABBIR API hostname at the returned Elastic IP.
5. Install the pinned official Supabase self-hosted Docker bundle and terminate TLS at a reverse proxy.
6. Restore DABBIR schema/data into the target.
7. Run `scripts/dabbir-uae-preflight.sql` and application regression/load tests.
8. Only after all gates pass, switch `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and the server-only service-role key in production.
9. Keep the old Supabase project untouched until rollback expiry.

## Current source audit

The source project is shared. The migration must not clone unrelated Barman/Zajel/governance application data. DABBIR runtime objects are primarily `public.dabbir_*`, `dabbir_private`, linked Auth rows, and the DABBIR storage bucket.
