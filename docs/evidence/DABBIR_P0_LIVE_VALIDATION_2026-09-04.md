# DABBIR P0 live validation evidence — 2026-09-04

Status: **BLOCKED — Preview/test credential isolation and the real 48-hour Shadow window are still open.**

Production remains unchanged by PR #474. The PR remains Draft. The P0 Production migration is not applied.

## Source identity

- Current PR head before this documentation-only refresh: `5ee8b3bcd0584ea27b343cfae508e68015dd6c30`
- Current `main` / Production runtime observed during continuation: `57d145408d1a571576183c43cc2b646b6057ab17`
- Previous exact-head Preview: `dpl_73XZc1nEWGBMCbgNR6ryxrgeusuy` — READY
- Migration: `supabase/migrations/20260904123000_dabbir_car_wash_killer_job_p0.sql`
- Migration SHA-256: `a8533f64b6f07dc961bddc70eeb4d6cb92da74af26f8b20c38057ec0ba2d150c`
- Schema-only artifact: `artifacts/dabbir-p0-schema-only-20260904.sql`
- Schema-only SHA-256: `94687b0073723fcefc7359b7d5dffec6d3c154e9db5ae0f6a9978bb2fc0f659d`
- Production migration status: **NOT APPLIED**

## Proven PostgreSQL / P0 baseline

The targeted P0 migration was previously compiled and exercised on Supabase Postgres 17.6 in the isolated `dabbir-p0-live-validation` branch using synthetic identities and synthetic phone data only.

Verified baseline includes:

- Forced-RLS tenant tables: `3/3`.
- Tenant A/B/outsider isolation passed.
- Authenticated direct writes to P0 ledgers denied.
- Concurrent confirmation of one crew/slot produced exactly one booking; the loser failed `CAR_WASH_CREW_DOUBLE_BOOKED`.
- Cancellation released capacity.
- Schedule, break, time-off and calendar-busy exclusions passed.
- Illegal transitions and idempotency replay were rejected/handled correctly.
- Kill Switch and Shadow outbound=0 logic passed.
- Payment without provider evidence was rejected.
- Reminder lease/finalize/delivery reconciliation/replay passed.
- Independent targeted restore and schema-only restore passed.
- Security Advisor after hardening: `0 ERROR`, `2 WARN`, `37 INFO`.
- Performance Advisor: no ERROR/WARN.

## Isolated Supabase branch — current truth

- Production: `DABBIR Mumbai` / `fphpoysqdsceniwduxjq` — ACTIVE_HEALTHY.
- Isolated branch: `dabbir-p0-live-validation` / `krjqfgkqksyknryolhdz` — runtime ACTIVE_HEALTHY.
- Branch metadata reports `MIGRATIONS_FAILED` because full historical replay still encounters the known legacy-baseline dependency gap (`dabbir_private` / `dabbir_memberships`). This is the known full-project DR gap; it does not remove the targeted P0 schema.
- Direct live inspection confirms the isolated branch contains:
  - `dabbir_car_wash_jobs`
  - `dabbir_car_wash_job_transitions`
  - `dabbir_car_wash_outcome_ledger`
  - `dabbir_car_wash_settings`
  - `dabbir_car_wash_booking_requests`
- Direct Production inspection confirms the three new P0 ledger/state tables are absent there: Production migration remains **NOT APPLIED**.

## Preview isolation — runtime probe

The verified Preview `dpl_73XZc1nEWGBMCbgNR6ryxrgeusuy` reached READY and had no build error/stderr/exit events.

Its live validation probe returned fail-closed:

- scope: `DABBIR_P0_TEST_ONLY`
- `database_target = non_test_database_blocked`
- `database_safe_for_test_execution = false`
- WhatsApp webhook configured: false
- WhatsApp outbound configured: false
- WABA configured: false
- Meta authorization: false / not attempted
- reason: `META_READ_CREDENTIALS_NOT_CONFIGURED`
- test recipient configured: false
- `live_execution_allowed = false`
- `secrets_exposed = false`

No Meta message was sent. No real customer or Production WhatsApp number was used.

## Real 48-hour Shadow window

The isolated test branch has two synthetic settings rows in `operator_mode = shadow` with:

- `shadow_started_at = 2026-09-04 14:58:16.211973+00`
- `kill_switch = false`
- `READ = true`
- `QUOTE = true`
- `MESSAGE = false`
- `BOOK = false`
- `ASSIGN = false`
- `REMIND = false`
- `CHARGE = false`

Latest safety checkpoint:

- jobs: `4`
- job transitions: `5`
- outcome ledger rows observed: `5`
- transitions with non-empty external result: `0`
- transitions using external permissions (`MESSAGE|BOOK|ASSIGN|REMIND|CHARGE`): `0`

The Shadow clock is real and must complete 48 elapsed hours. Earliest gate completion is approximately `2026-09-06 14:58:16 UTC` / `2026-09-06 18:58:16 Asia/Dubai`.

An hourly safety watch is active, and a continuation gate is scheduled immediately after the 48-hour point. Controlled Live remains forbidden until the elapsed Shadow gate passes.

## Application / CI state

Before the documentation-only continuation commits, exact P0 functional verification was green:

- Focused P0/WhatsApp/car-wash: `49/49`.
- Full suite: `1250/1250`.
- Build gate: `1250/1250`.
- DABBIR CI run 2191: SUCCESS.
- DABBIR Mobile CI run 238: SUCCESS.

Documentation-only continuation commits trigger fresh CI and Preview builds; their completion does not change the Gate A/Gate D blockers.

## Current gates

1. **Gate A — BLOCKED / fail-closed:** Preview is not yet fully scoped to the isolated Supabase test credentials and official Meta Test credentials/test recipient are absent.
2. **Gate B — BLOCKED:** real official Meta Test Number inbound/outbound/status E2E cannot start until Gate A is safe.
3. **Gate C — BLOCKED:** Owner Receipt from real provider test E2E is not yet available.
4. **Gate D — IN PROGRESS:** real 48-hour Shadow window is running with external action count still zero.
5. **Gate E — NOT STARTED:** Controlled Live is prohibited until Gate D passes.
6. **Gate F — PARTIAL:** Preview build and fail-closed probe are proven; final mobile/desktop Golden Canary belongs after the final functional head and current-main re-sync.

## Production safety

**Production is unchanged by this PR and remains outside the P0 test execution path. Do not merge PR #474, apply the P0 Production migration, or deploy this branch to Production before all gates pass and explicit owner approval is received.**
