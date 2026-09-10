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

### Production execution on dda4bee2 and failures retained

PR #687 merged as `dda4bee2ffc247df70ec4ab5ceaf62353134a003`, deployed as
`dpl_Hw5NwpnBbMZfgjwY9fa2D6a6GRsj`. Workflow `34432118238` pinned this exact
Production release before and after the journey. Arabic passed 35/35 required
checks. English passed 32/33; the full workflow therefore FAILED and its later
isolation stage was skipped. Both runs cleaned their disposable tenants/users.
The complete relevant evidence is retained in
`DABBIR_REAL_MODEL_PRODUCTION_DDA4BEE2.json`.

All four new live-model activity scenarios passed in both runs: services,
clinic, laundry and salon. Duration questions and the clinic boundary therefore
have actual-model evidence, beyond the deterministic benchmark. This remains
eight synthetic-context scenario executions, not 104 live-model conversations
or a real Meta round trip.

The English run exposed a stochastic continuity failure: after selecting an
exterior service, the state contained a guessed saloon vehicle and asked about
the delivery mode even though the catalog allowed only MOBILE. The reducer
accepted a quoted but semantically unrelated model entity as AI_INFERENCE,
which displaced the single-mode database default. The fix requires grounded
vehicle/delivery-mode evidence and ignores unsupported guesses. Two permanent
regressions exercise the failure with and without a model correction flag.
No raw provider reasoning is stored.

An independent boundary test found 2647 bytes of valid bounded provider metadata
would exceed the existing 2048-byte PostgreSQL event limit. Event metadata now
compacts repeated activity/attempt details while retaining the complete bounded
trace in the canonical state in the same transaction. The database limit is
unchanged. A real PostgreSQL JSONB size regression verifies the compact event.
Full suite after these fixes: 2680/2680; syntax check passed. A fresh Production
journey is still required for this follow-up change.

Fresh provider evidence: primary Gemini returned HTTP 429; Groq sometimes
succeeded and sometimes returned 400/429; Cloudflare timed out; the configured
Vercel AI Gateway completed fallback. Schema compatibility repair shares the
existing four-request/18-second bound. Tokens and available gateway costs are
retained in the evidence. Direct-provider monetary cost is unknown, not zero.
Model calls precede tool execution; there is no second model generation after
a booking mutation. Switching provider cannot itself invoke a business tool.

The store request SQL proof persisted one handoff and the canonical pending
handoff, with `action_required` conversation state. Replay returned the same
handoff and created no order or appointment. The transaction rolled back.
This proves durable request escalation, not conversational retail order creation.
See `DABBIR_BRAIN_STORE_REQUEST_SMOKE.sql` and its JSON evidence.

Rollout remains one business at 100% canary; businesses without an explicit
rollout retain shadow mode. No real customer's human takeover was reset and no
new activity was globally enabled to obtain a passing test.

The added concurrent outbound experiment initially failed at
`dabbir_whatsapp_connected_requires_verification`: its isolated connection has
never completed Meta authorization. Workflow `34434320596` cleaned all fixture
rows after that failure. No verification timestamp was fabricated. The retained
test instead requires three overlapping attempts to be denied by that real
connection gate and zero new send reservations. Successful outbound duplicate
suppression on an authorized real-phone path remains unproven; this rejection
test is not used to claim otherwise.

### Final fallback generation failure and bounded correction

The subsequent exact-release workflow `34434752594` on `bff9d58da4ee89dfb7f9dce9b6b673e1d05423b0`
failed English context-reference probe 15f. Goal, service and vehicle survived;
the planner returned `AI_PLANNER_UNAVAILABLE`, no reply and no execution. The
last Gateway HTTP response was 200 but the structured interpretation was rejected.
Usage reported 1593 output tokens, including 1536 reasoning tokens, against the
existing 1600-token cap. This strongly indicates output headroom exhaustion;
the artifact does not preserve the final provider finish reason, so truncation
is not asserted as a separately observed raw response field.

The verified Gateway catalogue lists `low`, `medium`, and `high` for the exact
configured `google/gemini-3.7-flash` model. Gateway's documented Chat Completions
mapping forwards `reasoning_effort: low` to Gemini's low thinking level. The
adapter now requests that setting only for semantic calls to this endpoint and
model, preserving the existing Groq setting. Ordinary replies, other models,
provider order, 1600 output tokens, four HTTP calls and the 18-second shared
deadline are unchanged. Low effort is not a guarantee of output completion;
the schema validator and truncation rejection remain mandatory.

Permanent regressions cover the actual four-provider request sequence, the
unchanged output cap, rejected truncated output despite low effort, and isolation
from ordinary reply generation. No reasoning text is requested or stored.

Sources checked 2026-09-10:
[Gateway model catalogue](https://ai-gateway.vercel.sh/v1/models),
[Google reasoning mapping](https://vercel.com/docs/ai-gateway/models-and-providers/reasoning/google),
[Chat Completions reasoning field](https://vercel.com/docs/ai-gateway/models-and-providers/reasoning).

Before this correction, PR #688 merged as `cab2f1e5c38f4e55c84ddb80d30a4ea6d442c6b4`
and deployed as `dpl_8rxqHo8JeXntsKa9Z1V1yZisC84P`. It includes the independent
single-delivery-mode authority correction from PR #689. The merged local suite
passed 2682 tests. Its exact Production journey is tracked in workflow
`34435559201`; completion is recorded separately, not presumed from deployment.

That workflow completed FAIL on the exact `cab2f1e5` release: the Arabic
context-reference probe again exhausted provider time (17.47 seconds; four
requests). It preserved history/goal/vehicle and performed no execution. The
goal-continuity and four-activity probes passed. English and the subsequent
isolation stage were skipped by the unchanged required gate. Artifact
`10136205310` (SHA256 `7a16d241d5e05209b08faf13a81d34880a739d4917d87031a4ea1edc3fa20fe8`)
retains the failure. The bounded-generation correction therefore still requires
a fresh exact-release Production journey. Local correction suite: 2686/2686,
zero failures or skips; syntax check passed.
