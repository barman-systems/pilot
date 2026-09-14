# DABBIR AWS UAE infrastructure — RETIRED

**Status: RETIRED / HISTORICAL ONLY**

As of 2026-09-14, the owner-directed decision is to decommission the DABBIR AWS migration path rather than complete it. Current DABBIR Production remains on the existing Vercel/Supabase authority. Nothing in this directory is an active Production deployment authority.

## Security boundary

- Active GitHub workflows that could assume the historical DABBIR AWS role are retired.
- The repository OIDC bootstrap for `DabbirGithubDeployRole` is retired and must not be recreated from this tree.
- Do not add AWS access keys, a replacement long-lived credential, or a broader temporary AWS role merely to make audit closure easier.
- Any future AWS adoption is a new architecture/security decision and must use a new explicit authority contract; it must not silently revive this migration path.
- Live AWS account decommission is tracked separately because repository authority cannot prove or perform the external trust-root mutation.

## Archived material

The remaining files under `infra/aws-uae/` are retained only as historical engineering/reference material. They describe an abandoned managed-AWS and earlier EC2/self-hosted migration design, including PostgreSQL compatibility work, runtime images, migration verification, and infrastructure templates. They are not approved deployment instructions.

The historical managed design had proposed VPC networking, RDS PostgreSQL 17, S3, ECR, ECS/Fargate, CloudWatch, encrypted storage/backups, and Supabase-compatible Auth/REST/Storage contracts. The prior source audit baseline and compatibility notes remain useful only for forensic/reference purposes.

## Production truth

For current release/runtime decisions, use the canonical Vercel/Supabase Production evidence in the repository and P0-A audit records. Do not infer Production state, readiness, or authority from this retired directory.
