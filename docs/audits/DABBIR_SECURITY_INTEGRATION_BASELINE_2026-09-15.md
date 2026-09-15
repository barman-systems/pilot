# DABBIR Security & Integration Baseline — 2026-09-15

## Classification

Historical security/integration snapshot. This document is evidence of checks performed at the stated point in time; it is not current runtime authority.

## Scope

This review intentionally does **not** change repository visibility. It verifies the remaining controls requested by the owner:

- GitHub → Vercel deployment integration;
- GitHub → Supabase migration/advisor integration;
- current Production release evidence;
- Supabase Production health and current security-advisor state;
- repository secret-exposure controls, including the newly added full-history audit path.

## Verified live baseline before the history scan

- GitHub protected `main` at review start: `aff6ed04e10bb2443aedd8ceafae662186e4e8f2`.
- Vercel Production was READY on the exact same SHA and `/api/release-evidence` returned that SHA as Production.
- BARMAN Independent Verifier completed successfully on that exact main SHA.
- DABBIR CI completed successfully on that main SHA, including Production database change discipline, Supabase advisor regression gate, DABBIR tests, committed-source secret scan, and migration-deploy proof.
- Supabase project `fphpoysqdsceniwduxjq` reported `ACTIVE_HEALTHY` on Postgres 17.
- Live Supabase Security Advisor matched the reviewed baseline: one `rls_enabled_no_policy` INFO finding for `public.dabbir_posthog_product_event_outbox_v1` and nine reviewed `authenticated_security_definer_function_executable` WARN findings. No new advisor class or count drift was observed in this check.

## Gap found

The canonical CI secret check used `git grep` against the currently checked-out tree only. That is useful for preventing a new committed secret on the candidate tree, but it does **not** prove that a secret never existed in an older commit or a still-reachable branch/PR head.

## Remediation added

A dedicated full-history audit now:

1. fetches reachable branch heads, tags, and GitHub pull-request heads;
2. scans added lines across all fetched reachable Git history;
3. detects high-confidence provider tokens, private keys, credentialed Postgres URLs, legacy Supabase `service_role` JWTs, and hardcoded values for named high-risk runtime secrets;
4. writes only detector/commit/path metadata — never the secret value;
5. uploads a redacted audit artifact and fails closed on any finding.

The audit runs when its scanner/workflow/test contract changes and remains manually dispatchable for future rechecks. It is deliberately kept out of every ordinary PR/main hot path to avoid turning a historical scan into recurring CI noise.

## Closure boundary

This snapshot is not complete until the first canonical full-history run finishes. If that run reports findings, affected credentials must be treated as exposed until independently invalidated or rotated. A clean run proves no match for the implemented high-confidence detectors across the fetched reachable refs; it does not claim mathematical absence of every possible secret format or unreachable garbage-collected Git object.
