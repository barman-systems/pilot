# Conditional availability execution — 2026-09-10

The exact `855813a` Production journey passed Arabic 35/35, English iPhone 33/33,
iPad WebKit, and cross-tenant/WhatsApp isolation 13/13 (workflow `34436236376`).
That did not cover the result-dependent part of “if today is unavailable, check
tomorrow”. A stronger benchmark exposed a real gap: with service and time already
known, the orchestrator checked the first date, received zero slots, and asked
for another time without checking the customer's stated alternative.

The frozen 104 cases are retained. The optional
`--require-conditional-fallback` variant adds one independent case with service
and time supplied on turn 1, followed by the explicit conditional message on
turn 2. Its oracle requires two real adapter calls in the requested date order
after the first empty result. The unmodified `855813a` result remains saved as
`DABBIR_UNSEEN_STRICT_FINAL_855813A.json` (101/105). It is not counted as passing.

## Minimal repair

The reducer retains an explicit alternative date on the existing canonical date
fact. A current explicit correction or withdrawal removes it. Model extraction
cannot reinterpret a quoted “tomorrow” as a correction that discards the ordered
condition. The behavior is bounded to the already parsed today/next-day condition.

After an actual empty availability result, the active brain calls a new guarded
state-transition RPC. The database requires the current batch lease, tenant and
customer scope, newest message revision, exact semantic version, CHECK_AVAILABILITY
authority, a fresh empty DATABASE_FACT read at that version, and an explicit
customer date with one next-day alternative. It consumes the alternative,
increments the semantic version and records the transition atomically. The
orchestrator checks availability again using that new version. No extra model
call or booking mutation is introduced.

The service-role-only additive migration is
`20260910043500_dabbir_conditional_availability_date_v1.sql`. Existing functions,
tables, RLS and commit/replay behavior are preserved. It locks conversation then
canonical state using the established guard, rechecks the version after the row
lock, and rejects stale/duplicate transitions. Rollback: revert the application
caller, then drop only the new function; no table or customer data is removed.

## Verification before deployment

- Six focused tests pass, including actual PGlite execution of the migration.
- SQL negatives cover absent/nonempty/expired/untrusted read receipts, incorrect
  version, inferred dates, missing alternatives, two-day jumps, mutation actions,
  newest-message revision, duplicate transition and denied anon/authenticated calls.
- Orchestrator tests cover first-day availability, next-day availability after an
  empty first result, transition failure, second-read failure, no success reply
  on failure, and no booking from a date preference.
- Full suite: 2692/2692, zero failures or skips; syntax passed.
- Real Production preflight used an isolated rollback transaction and an existing
  synthetic appointment that blocks the whole first-date candidate range. The
  actual availability function returned zero slots at canonical version 1.

The complete real PostgreSQL transition proof is in
`DABBIR_CONDITIONAL_AVAILABILITY_PRODUCTION_SMOKE.sql`. Run it after the additive
migration and before deploying the new caller. It must read zero actual slots,
persist the next date/version, find real next-date slots, reject duplicate and
late transitions, and leave the initial appointment count unchanged. All QA data
rolls back. This is not a Meta or real-phone proof.

Migration application, actual SQL results, deployment SHA and the next exact
Production journey are recorded after execution. No success is presumed here.
