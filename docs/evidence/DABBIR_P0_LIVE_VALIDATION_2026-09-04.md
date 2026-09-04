# DABBIR P0 live validation evidence — 2026-09-04

Status: **BLOCKED — official WhatsApp Test Number and the real 48-hour Shadow window are not yet proven.**

Production was not changed. The PR remains Draft. Neither Production schema nor a real business WhatsApp number was touched.

## Source identity

- Main and Production SHA at re-sync: `0ed73ec41fea4234e0b91d64b40722c2a5023fad`
- P0 branch/PR SHA used by the first post-fix Preview: `9fb65931e9deefc6ac0f37eef2a91762e687fcd1`
- Migration: `supabase/migrations/20260904123000_dabbir_car_wash_killer_job_p0.sql`
- Migration SHA-256: `a8533f64b6f07dc961bddc70eeb4d6cb92da74af26f8b20c38057ec0ba2d150c`
- Schema-only artifact: `artifacts/dabbir-p0-schema-only-20260904.sql`
- Schema-only SHA-256: `94687b0073723fcefc7359b7d5dffec6d3c154e9db5ae0f6a9978bb2fc0f659d`
- Production migration status: **NOT APPLIED**

## Actual PostgreSQL validation

The migration was compiled and exercised on Supabase Postgres 17.6 in the isolated `dabbir-p0-live-validation` branch. Test data used synthetic `.test` identities and synthetic phone numbers only.

Three defects found by actual PostgreSQL execution were fixed:

1. Low-confidence extraction returned price and slots instead of failing closed.
2. Atomic confirmation wrote into generated currency/price columns.
3. Reminder leasing had an ambiguous `business_id` column reference.

Verified results:

- Low confidence: `HUMAN_REQUIRED / LOW_CONFIDENCE`.
- Illegal transition: rejected.
- Same transition/idempotency key: replayed without a second transition.
- Two concurrent confirmations for the same crew and slot: one booking succeeded; the other failed with `CAR_WASH_CREW_DOUBLE_BOOKED`.
- Cancellation released capacity and a replacement booking succeeded.
- Worker branch membership, work schedule, break, time off and calendar busy blocks all changed availability as expected.
- Payment without verified provider evidence: rejected.
- Verified payment evidence: accepted; Estimated, Verified, Recovered and Lost remained distinct.
- Shadow outbound rows: `0`.
- Kill Switch: new automated action rejected.
- Reminder lease, finalize, delivery reconciliation and duplicate delivery replay: passed.

Catalog evidence on the applied P0 schema:

- Forced-RLS tenant tables: `3/3`
- Tenant SELECT policies: `3`
- Car-wash indexes: `18`
- Car-wash foreign keys: `27`
- Car-wash triggers: `3`
- Authenticated table grants on new P0 ledgers: SELECT only
- Anonymous execute on every public car-wash RPC: false
- Service-role-only WhatsApp RPCs: confirmed

Actual RLS execution:

- Tenant A could read Tenant A and could not read Tenant B.
- Tenant B could read Tenant B and could not read Tenant A.
- A user without membership read zero rows.
- Direct INSERT/UPDATE by `authenticated` on P0 ledgers was denied.

## Security and performance advisors

After hardening the legacy migration helper:

- Security Advisor: `0 ERROR`, `2 WARN`, `37 INFO`.
- The two warnings are intentional authenticated `SECURITY DEFINER` owner paths. Both independently verify active tenant permission; non-human actors remain service-role-only.
- Performance Advisor: `0 ERROR/WARN`, `65 INFO`. The P0 notices are unindexed-FK recommendations, not correctness failures; hot-path business/time indexes are present.

## Independent restore proof

Two temporary Supabase branches were created and deleted after use:

1. Full fixed migration restore: baseline + migration compiled; Availability returned a 220 AED slot; two concurrent confirmations produced exactly one booking; same-key replay returned the same booking.
2. Schema-only artifact restore: the independent artifact applied successfully; Availability → Confirmed → Assigned succeeded; member read and direct-write denial passed; the restored catalog contained `3` Forced-RLS tables, `3` policies, `18` indexes, `27` foreign keys and `3` triggers.

Remaining recovery limitation: the repository's complete historical migration chain still does not reconstruct the whole legacy operational baseline on a blank branch. P0's targeted additive restore is proven, but full-project disaster recovery remains a separate open gate.

## Application verification

- Full Node test suite after current-main merge: `1245/1245` passed.
- Focused live-validation/WhatsApp/car-wash contracts: `29/29` passed.
- JavaScript syntax: passed.
- DABBIR build: passed.
- Production dependency audit: `0 vulnerabilities`.
- Exact-sha Preview `9fb6593…`: READY.
- Preview safety probe: correctly blocked live execution because Preview was not yet scoped to the Test database and Meta Test credentials were absent.

## Cost ledger

| Resource | Purpose | Cost | Duration | Type | Stop method |
|---|---|---:|---:|---|---|
| Supabase live-validation branch | PostgreSQL/Shadow evidence | `$0.01344/hour` | Active until Shadow evidence is complete | Recurring hourly | Delete branch |
| Supabase full-restore branch | Migration + concurrency restore test | About `$0.0023` | About 10 minutes | One-time | Deleted |
| Supabase schema-dump restore branch | Independent schema-only restore | Under `$0.001` | About 3 minutes | One-time | Deleted |
| Meta/AI/Vercel usage | Not used yet | `0 AED measured` | — | — | — |

Projected Supabase cost for a 48-hour Shadow window is `$0.64512`, approximately `2.37 AED`. This is well inside the approved 300 AED cap.

## Rollback / containment

1. Set the tenant Kill Switch and `operator_mode=paused` before stopping workers.
2. Disable MESSAGE/BOOK/ASSIGN/REMIND/CHARGE permissions.
3. Stop reminder/webhook writes and preserve audit, transition and outcome rows.
4. If no real P0 data exists, drop the view, functions, triggers, policies and P0 tables in dependency order.
5. If P0 data exists, do not destructive-rollback; keep the ledgers and ship a forward fix.
6. Production alias and schema remain unchanged until explicit owner approval.

## Open gates

- Scope Preview Supabase variables to the isolated test branch.
- Configure an official Meta Test Number/Test WABA and authorized test recipient.
- Complete signed inbound and provider delivery-status E2E.
- Run a real 48-hour Shadow window with outbound count equal to zero.
- Run Controlled Live only in the Test tenant after Shadow passes.
- Re-run final browser/mobile Golden Canary on the final Preview SHA.

