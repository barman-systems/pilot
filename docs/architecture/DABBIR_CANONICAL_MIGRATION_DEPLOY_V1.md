# DABBIR Canonical Migration Deploy V1

## Purpose

DABBIR Production migrations have one ordinary deployment path:

```text
reviewed PR
  -> required exact-head gates
  -> squash merge to protected main
  -> registered DABBIR CI
  -> migration-deploy job after CI success
  -> fixed scripts/dabbir-migration-deploy.sh
  -> existing Production database credential
  -> one atomic migration transaction
  -> schema_migrations exact-source provenance
  -> post-deploy content drift proof
```

The earlier standalone `dabbir-migration-deploy.yml` experiment was retired because GitHub did not register/execute that new workflow reliably. Migration authority is deliberately embedded in the already-established `DABBIR CI` workflow instead of maintaining a second workflow authority.

This does not add a new database credential, service, server, broker, agent, or paid dependency. It constrains the existing `SUPABASE_DB_URL` already used by the protected Production recovery workflow.

## Cutover

Canonical post-cutover versions are strictly greater than:

```text
20260915124900
```

At cutover, Production had no `schema_migrations` rows at or above this boundary. The first canonical CI run therefore reconciles already-merged post-cutover migration files, including Episode Correlation Authority V1, instead of requiring a manual SQL application.

## Source authority

A deployment is eligible only when all are true:

- repository is exactly `barman-systems/pilot`;
- event is a push to `refs/heads/main`;
- the `DABBIR CI` test job for that push completed successfully because migration deploy has `needs: test`;
- checked-out HEAD equals `GITHUB_SHA`;
- the main commit maps to exactly one merged PR;
- the squash commit's sole parent equals that PR's base SHA;
- the PR head has latest `test=success` and `Vercel=success` statuses;
- `DABBIR CI` and `DABBIR Security Gate` completed successfully for the exact PR head.

`workflow_dispatch` may run ordinary CI tests, but the migration job is explicitly restricted to `event_name=push` on protected `main`, so manual CI dispatch cannot enter migration authority.

The Production DB secret appears only in the migration-deploy step. It is unavailable to PR validation and ordinary CI test steps.

## Migration source contract

After cutover, migration history is append-only from Git:

- changed migration files in a main push must be additions only;
- a new migration must have a 14-digit version greater than cutover;
- migration SQL is bounded in size;
- psql meta-commands are forbidden;
- transaction control is forbidden inside migration source because the deployer owns the transaction;
- `CREATE/DROP DATABASE`, `VACUUM`, `COPY`, `ALTER SYSTEM`, and `CONCURRENTLY` operations that cannot be safely owned by the transaction are denied;
- migration source cannot read/write `supabase_migrations.schema_migrations` directly.

PL/pgSQL function bodies may contain their own `BEGIN/END`; the source guard tokenizes SQL quoting/comments so function bodies are not confused with top-level transaction control.

## Atomic application

For each missing version, the CI deploy script:

1. takes a transaction-scoped advisory lock for the version;
2. rechecks the version does not already exist;
3. applies the exact Git migration file using psql inside one transaction;
4. inserts one `schema_migrations` row in the same transaction containing:
   - version,
   - exact source text in `statements[1]`,
   - canonical migration name,
   - `created_by = dabbir-ci-migrator:<actor>:<merge_sha>:run:<run_id>`,
   - content-addressed idempotency key,
   - no fabricated rollback payload.

Any error rolls back both schema changes and provenance registration.

## Drift proof

Every main CI migration run builds a manifest from **all** Git migration files after cutover, not only the current diff.

Production must contain exactly the same set of versions. For each row the deployer compares:

- migration name,
- content-addressed idempotency key,
- SHA-256 of `schema_migrations.statements[1]`,
- Git blob SHA-1 recomputed from the actual stored SQL text,
- `created_by` matching the canonical CI actor format.

The SHA calculations are server-side using installed `pgcrypto`. A name-only match is insufficient.

Any missing, extra, mismatched, or unattributed Production row makes the CI migration job fail.

## Ordinary vs break-glass authority

This CI job is the ordinary migration channel. It does **not** claim that a database owner can be made technically incapable of emergency administration.

Raw Production SQL through ChatGPT/MCP/SQL Editor is not an ordinary deployment path. Emergency break-glass remains separate and must not be emulated through free-form workflow inputs.

Accordingly the deployment path deliberately has:

- no arbitrary SQL input;
- no migration selector input;
- no Supabase Management API token in the deploy script;
- no service-role key;
- no standalone migration workflow authority;
- no mechanism to select a migration outside the reviewed Git manifest.

## Cost

No new paid service or subscription is introduced. The design uses the existing GitHub Actions CI, the existing Production environment secret, PostgreSQL, Docker tooling already used by Recovery Proof, and pgcrypto already present in Production.
