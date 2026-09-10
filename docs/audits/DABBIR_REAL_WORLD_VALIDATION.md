# DABBIR real-world validation — work in progress, 2026-09-10

Verified starting Production/main SHA: `986379a1efc1122a23991cdb46231ab9164a6efb`.
Public `/api/release-evidence` reports deployment `dpl_GMUA2v9gwSpCKdaewySBBu8DmxkH`.
Previous successful real-model/application workflow: `34396326196`.

## Independent benchmark

The frozen specification is `test/fixtures/understanding/unseen-spec.mjs`: 104
individually written examples, eight business types observed in Production.
SHA-256: `94be8589f0d718ddb67b18fa4fde45a9c3bd3a68bd33e18183a08f22c237b9e0`.
The original 120 cases were not reused. Expectations were written before code
changes. Full failures, denominators, replies and tool traces are retained in
the JSON reports. These are deterministic interpretation tests with fixture
SQL/transport adapters, not live-model or real-device proof.

Baseline reducer: 82/104. Baseline orchestrator: 81/104. Candidate orchestrator:
101/104 before the remaining validation work. One baseline runtime failure is
an evaluator defect: SUPERSEDED returns before committing, and the original
runner looked only at commit metadata. The candidate runner captures that return.

Specification erratum (not an application defect): `complex/restart-with-new-service`
starts at 08:00 UTC and adds 12 hours. Dubai local time is midnight September 11
on the second turn, so “tomorrow” correctly means September 12, not September 11.
The frozen expectation and raw failed result remain unchanged and visible.
Do not report raw 104/104 from this corpus.

Remaining deterministic failures: duration side question and clinic diagnosis
handoff. They require exercising the live semantic interpreter, which normally
supplies a grounded service-question facet or high-risk handoff proposal.
The score alone does not establish full conversational understanding.

## Confirmed defects fixed

- Bind an ordinal to its closest noun; retain service while invalidating an
  explicitly different vehicle. Scope historical reuse to the reference clause.
- Resolve “previous service” against actual completed history after a new conversation.
- Persist explicit withdrawal of a draft, clear pending choices/queued work,
  and prevent a generic model intent from restoring the withdrawn goal.
- Interpret a conditional date preference in its stated order.
- Ask a minimal clarification for an ungrounded demonstrative reference.
- Filter upcoming appointments by customer as well as branch/business before
  model context, selection, and presentation. SQL already enforced this scope;
  this closes an earlier reasoning/presentation gap.
- Without grounded separate request spans, a cancel-and-book instruction cannot
  silently execute cancellation and discard the new booking request.
- An empty trusted service execution catalog takes the existing durable handoff
  path. This is safe lack-of-capability behavior, NOT a retail order implementation.
- Expand success-claim receipt checks and apply them to both rollout paths.
- Add bounded provider/model/fallback/token/cost metadata to decision events.
  Missing monetary evidence stays null. No raw reasoning or arbitrary provider
  payload is copied.

## WhatsApp evidence and real-device blocker

One connected Meta connection has a stored token and no observed expiry at the
time of inspection. The newest provider-verified inbound event was
2026-09-10 02:14:43 UTC. Its batch stopped at
`AI_BLOCKED_BY_HUMAN_TAKEOVER`; the conversation was already handed to a human
after an earlier repeated-requirement failure. The guard was preserved.
No new outbound/delivery event proves the full new-brain phone round trip.
WhatsApp Web currently displays its QR/device-link sign-in screen.
A human must link an authorized test phone or originate a test conversation
from that phone. No Meta secret was missing from the stored connection, and no
claim of complete Meta round-trip verification is made.

Observed Production business types include car_wash, salon, laundry, clinic,
services, store, creator, real_estate, other. The activity registry's execution
actions are appointment-oriented; it has no conversational CREATE_ORDER action.
The existing dabbir_orders tables do not by themselves prove conversational
order execution. This remains a separate unmet acceptance requirement.

## Database and concurrency proof

Production SQL created and read back exactly one synthetic booking; retrying
returned the same appointment. Cancellation was executed once and replayed in
separate backend sessions. Connector calls did NOT overlap in transaction time,
so those results are idempotency proof only. The disposable tenant and auth user
were removed, with zero residual rows verified. Initial cleanup attempts rolled
back at the existing offboarding/account identity gates; the final cleanup
removed only the explicitly synthetic connection and followed the existing
account tombstone mechanism. No gate was disabled.

`scripts/dabbir-brain-real-db.mjs` uses the already configured CI management
credential and the documented POST `/v1/projects/{ref}/database/query` API.
It requires explicit QA acknowledgement, generates isolated test UUIDs, checks
that three independent backend transactions actually overlap, verifies one
booking/action row, injects B/C while A is delayed, requires supersession, and
always attempts scoped cleanup. Evidence is uploaded by its workflow.
No real Meta request or real customer mutation is used by this test.

## Verification status

Local complete suite after the application changes: 2673 passed, zero failures.
No dependency or database migration was added. Production rollout flags,
customer conversation ownership, provider order and budget are unchanged.
This document is not a final PASS; release and real-device evidence must be
appended after execution.

### Independent transaction result

Workflow `34430813094`, job `102725746783`, on candidate `ca9659cc` passed.
Three distinct backend sessions overlapped: the holder transaction ran from
02:47:39.389 to 02:47:47.458 UTC; competitors started at 02:47:45.512 and
02:47:45.581. All returned the same appointment. One result was a fresh execution
and two were idempotent replays. Readback: one booking and one action ledger row.
The delayed decision was rejected with `SEMANTIC_SUPERSEDED` after B/C advanced
the conversation revision to 3. Cleanup verified zero tenant and owner rows.
The full artifact is retained in `DABBIR_REAL_DB_CONCURRENCY_EVIDENCE.json`.

An earlier workflow `34430589359` failed and cleaned up. Its harness took a batch
row lock ahead of the application's canonical lock order. The revised harness
acquires the existing `dabbir_semantic_assert_current_v2` guard before waiting;
no Production locking function was changed. The first error report only retained
`DB_QUERY_FAILED`, so the exact server error class was not independently captured.

The required Production journey now also invokes four fixed unseen live-model
scenarios for services, clinic, laundry and salon. These diagnostics expose no
mutating tool and do not claim to replace real database or Meta proof.

### Fair baseline replay

The corrected runner was replayed against a separate immutable worktree at
`986379a1`, using the identical frozen specification. Comparable scores are
**82/104 before → 101/104 candidate**. The earlier 81/104 report is retained as
raw initial evidence, not used to claim an extra application improvement.

| Metric | Baseline | Candidate | Scope |
|---|---:|---:|---|
| Goal continuity/understanding | 10/11 | 11/11 | Explicit goal assertions only |
| Entity resolution | 146/153 | 152/153 | Labelled entity assertions |
| Reference resolution | 27/28 | 28/28 | History/reference entity assertions |
| Context carryover | 68/71 | 70/71 | Carry/history/complex assertions |
| Next action | 53/68 | 66/68 | Explicit action expectations |
| Tool selection | 14/20 | 19/20 | Expected tool vs actual fixture adapter call |
| Unnecessary questions | 0/43 | 0/43 | Cases with explicit must-not-ask facts |

End-to-end hallucinated-action and state-persistence rates are not estimated
from a fixture adapter returning success. Receipt-negative unit regressions and
the actual database proof are reported separately. The temporal spec erratum
remains included in the raw failure count.

### Actual database execution across activities

Three additional rollback-only Production transactions passed for salon,
services, and laundry using the existing activity schema and guarded RPCs.
Each exercised context/load, CAS/replay, availability and canonical read receipt,
booking/readback/idempotency, verified memory, reschedule, cancellation and stale
message rejection. Laundry used PICKUP and required verified GPS; salon and
services used AT_BUSINESS and did not require a vehicle. Inapplicable checks
are null, not counted as passing. SQL and results are retained alongside this
report. No production customer data or activity settings were changed.

Live catalogue counts at inspection: car_wash 3 services, salon 4, services 2;
laundry and clinic have existing businesses but zero configured services. The
test catalogues for those activities are explicit synthetic QA setups exercising
the real ontology, not claims of existing populated customer deployments.
Store has one existing order and no services; conversational order execution
still lacks a supported brain action.
