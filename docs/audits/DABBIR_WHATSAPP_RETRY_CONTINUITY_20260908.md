# WhatsApp retry and interrupted-request continuity

Production incident, 2026-09-08: a car-wash request at 16:15 UTC became
HUMAN_REQUIRED with AI_PLANNER_UNAVAILABLE on attempt 1. The later greeting at
17:18 UTC ran the deterministic greeting shortcut with zero model calls. The
handoff had been returned to AI; there was no active human takeover to bypass.

The understanding orchestrator requested RETRY correctly, but the older provider
failover RPC converted that first retry into immediate handoff. Provider failure
also returned before semantic persistence, losing the unfinished request context.
The idle-session greeting shortcut then started a generic conversation.

This change:
- preserves the first durable retry in both worker and cron failover paths;
- permits provider handoff after two attempts, with customer_requested_human=false;
- checkpoints interrupted semantic facts with zero operational confidence and no
  semantic batch execution authority; successful retry can commit normally;
- keeps an unexpired interrupted request across idle greetings and asks whether to
  continue; a greeting cannot authorize a booking or a stale time/slot;
- acknowledges only a verified queued/assigned handoff, with idempotent outbound
  delivery and provider receipt verification, excluding newer customer/human turns;
- logs bounded provider/status/duration categories on provider-chain failure,
  without customer text, identifiers, upstream bodies, tokens or URLs.

This is a general WhatsApp lifecycle fix, independent of activity type. Existing
activity requirements, tenant/branch guards, human takeover and booking proof
remain authoritative. This change does not assert that an upstream AI provider
has recovered; the original error discarded upstream diagnostic details.

Verification includes real migration execution in PGlite: first retry, second
handoff, newer-message cancellation, human ownership, tenant/customer scope,
checkpoint authority revocation, successful retry commit and client RPC denial.
Runtime tests cover resumed/expired greetings, elapsed time and private logging.

Rollout: additive migration before application deployment; no historical migration
is edited. Verify applied SQL against repository bytes. Then merge only after CI
and required security gates, and verify main/deployment/release-evidence identity.
Run production SQL checks inside a rollback transaction with synthetic rows and
no external sends. Do not replay the affected customer batch.

Rollback: application rollback may keep the new database retry policy, which is
compatible with the old RETRY worker response. Do not restore immediate first-
failure handoff. Any database correction must be another forward migration.

The full repository security scan currently reports four pre-existing endpoint
recognition findings in calendar-connections, calendar-sync,
platform-customer-support and platform-customers. The required CI security gate
uses changed endpoints plus full-repository secret/client/security invariants;
its result is recorded separately from that broader baseline scan.

Applied migration: `20260908173803_dabbir_provider_retry_checkpoint_v1.sql`.
Repository and production history SQL MD5: `7c74d1bade79f10da288de1d7a13b73e`.
Local suite: 2149 PASS. Required change security and DB discipline gates PASS.
