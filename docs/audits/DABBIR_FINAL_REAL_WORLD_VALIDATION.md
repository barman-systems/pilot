# DABBIR final real-world validation — 2026-09-10

This report continues the verified `986379a1` baseline. It does not claim that a
synthetic webhook, direct API call or fixture is a real-phone WhatsApp test.
Overall verdict: **CONDITIONAL PASS for this conversational-brain validation
scope**. Exact Production `eb826bca7f08b7b5b58bba06639f31b21a23c0c4` passed its
full required journey after the discovered billing side effect was fixed and
verified on the real scheduled cron. CI passed **2699/2699** tests. The strengthened
independent benchmark is **102/105**, versus **82/105** at the original baseline;
the three raw semantic/oracle discrepancies are disclosed below.
Real-phone Meta acceptance remains blocked by test-phone device linking. This
is the outstanding acceptance condition for the complete phone chain. Separately,
the platform-wide BAR-12 launch gate retains its 12 baseline prerequisites; this
report does not grant platform launch approval.

This does not certify global rollout, an unimplemented retail order engine, or
a fabricated zero-error rate across all real customers. Limits and raw results
are retained below.

## Releases and actual changes

| Evidence | Commit / result |
|---|---|
| Starting Production | `986379a1efc1122a23991cdb46231ab9164a6efb`, deployment `dpl_GMUA2v9gwSpCKdaewySBBu8DmxkH` |
| Reference/state/tool hardening, PR [687](https://github.com/barman-systems/pilot/pull/687) | `dda4bee2ffc247df70ec4ab5ceaf62353134a003` |
| Grounded finite entities and bounded event telemetry, PR [688](https://github.com/barman-systems/pilot/pull/688) | `cab2f1e5c38f4e55c84ddb80d30a4ea6d442c6b4` |
| Concurrent independent single-mode authority fix, PR [689](https://github.com/barman-systems/pilot/pull/689) | `bff9d58da4ee89dfb7f9dce9b6b673e1d05423b0`, preserved in #688 |
| Concurrent independent semantic generation correction, PR [690](https://github.com/barman-systems/pilot/pull/690) | `855813a151c832119600a4521a1006bf401af7dc` |
| Previous fully verified deployed application | `855813a151c832119600a4521a1006bf401af7dc`, deployment `dpl_8diFgZmhZ7AkccD1cvqpcR697tca` |
| Verified conditional date execution PR [692](https://github.com/barman-systems/pilot/pull/692) | `b9c9b0ed3b90bde29a64c73ca7b22bd63d2830b1`, deployment `dpl_AGrYTSHtu8fvyu63y3qSMRkUpGDZ` |
| Final verified Production, billing lifecycle PR [693](https://github.com/barman-systems/pilot/pull/693) | `eb826bca7f08b7b5b58bba06639f31b21a23c0c4`, deployment `dpl_8svUgU3GKcWENuoaYjpwdUFgFLVT` |
| Overlapping alternative, PR [691](https://github.com/barman-systems/pilot/pull/691) | Closed without merge after #690 arrived; never deployed |

One additive service-role-only database migration was applied in this phase:
`20260910045420_dabbir_conditional_availability_date_v1.sql`. No dependencies were
added. No production data was deleted. Disposable QA rows were created and removed under the existing
offboarding guards, or tested in transactions that rolled back. No rollout,
human-takeover, RLS, confirmation or connection-verification gate was disabled.

### Confirmed causes and corrections

- Ordinals could attach to the wrong noun; history reuse could also swallow a
  later correction. Resolve the nearest noun and scope the historical clause.
- Returning-customer references needed completed operational history rather
  than the latest draft. Revalidate historical service against the current
  business/activity catalogue.
- Withdrawal could be lost to generic intent/goal continuity. Explicitly clear
  the abandoned draft and pending choices, without cancelling an actual booking.
- A model quote existed in the message but did not support its proposed vehicle
  or delivery mode. Require semantic evidence for these finite entities; the
  current customer's explicit facts and trusted database defaults win.
- Upcoming appointments were already isolated by execution SQL, but the context
  and presentation path needed the same customer/business/branch filter.
- Valid bounded provider metadata could exceed the event's 2048-byte PostgreSQL
  JSONB limit. Compact event metadata and retain the full safe trace in canonical
  state in the same transaction; keep the database limit intact.
- The final Gateway model spent most output tokens on reasoning, or timed out,
  after direct providers failed. The integrated #690 adapter requests low effort
  and 2400 semantic output tokens. Four actual HTTP requests, the 18-second
  shared deadline, schema rejection, and operational authority checks remain.

The original full suite had 2646 tests. Verified Production `855813a` had 2684.
Candidate `0074ca3` adds two negative provider regressions and six conditional
availability regressions: **2692/2692 passed**, zero skips/failures, in 22.14
seconds. Syntax checking passed. This JavaScript repository has no separately configured lint or typecheck
script; those are not reported as executed. CI also runs its existing security,
dependency, contract, booking and production regression gates.

## Current execution and authority path

`api/dabbir-whatsapp-webhook-coexistence.js` verifies the original signed Meta
envelope before delegating to `api/dabbir-whatsapp-webhook.js`. The latter
validates the SHA256 HMAC using a timing-safe comparison and persists inbound
identity/ledger records through existing tenant-scoped SQL. Worker/cron claims
the durable batch, then `_dabbir-whatsapp-ai-core.js` loads trusted context and
calls `_dabbir-understanding-orchestrator.js`.

The orchestrator loads the canonical version, message revision, verified memory,
activity profile and operational history. The context resolver and goal reducer
use those facts; the model proposes semantic interpretation only. The validated
decision is committed with compare-and-swap before tools. The guarded SQL router
executes booking/reschedule/cancellation and returns a verified receipt. The
reply path checks that receipt, reserves outbound idempotently, sends through
Meta and records presentation/delivery correlation.

Canonical state preserves the goal, entities and provenance, unresolved/missing
facts, queued goals, pending clarification, commitments, operational references,
version/revision and safe provider/decision metadata. Old conversation state,
customer preference, completed operational history and an active booking are
separate sources of authority. A new explicit request outranks old preference.

The model does not supply tenant or customer authority. Canonical SQL guards
recheck business/customer/branch, current revision, service capability and
confirmed slot before mutation. Successful HTTP model output is not tool
success. There is no model generation after a booking mutation in this path.

The last-mile response guard rejects unsupported success claims and unexecuted
operational promises in Arabic/English. Mutation failures propagate before a
success reply or pending-state clear. A transport or model failure checkpoints
recoverable state and returns RETRY without executing a guessed plan.

## Independent unseen benchmark

104 independently written cases were frozen before the application changes.
They cover eight observed activity types and do not reuse the original 120 cases.
Specification SHA256:
`94be8589f0d718ddb67b18fa4fde45a9c3bd3a68bd33e18183a08f22c237b9e0`.
The same corrected runner was used against immutable `986379a1` and current code.

**82/104 baseline (78.85%) → 101/104 current (97.12%).**
This is the actual orchestrator using deterministic interpretation and fixture
SQL/Meta adapters. It is not 104 actual-model or real-phone conversations.

| Metric | Before | After | Denominator / limit |
|---|---:|---:|---|
| Goal understanding/continuity | 10/11, 90.91% | 11/11, 100% | Only explicitly labelled goal assertions |
| Entity resolution | 146/153, 95.42% | 152/153, 99.35% | Labelled entity assertions |
| Reference resolution | 27/28, 96.43% | 28/28, 100% | Labelled reference/history entity assertions |
| Context carryover | 68/71, 95.77% | 70/71, 98.59% | Carryover/history/complex assertions |
| Correct next action | 53/68, 77.94% | 66/68, 97.06% | Explicit action labels |
| Tool selection | 14/20, 70% | 19/20, 95% | Actual fixture adapter call vs expected tool |
| Unnecessary question rate | 0/43, 0% | 0/43, 0% | Explicit must-not-ask labels only |
| End-to-end hallucinated action rate | Not measured | Not measured | Cannot infer zero from successful fixture receipts |
| End-to-end state persistence accuracy | Not measured | Not measured | Actual PostgreSQL readback proof is separate below |

Three raw failures remain visible. Duration-side-question and clinic diagnosis
boundaries require the semantic model and passed separate actual-model probes.
The restart case has a frozen oracle error: after 12 hours the business's Dubai
date has changed, so “tomorrow” is September 12, not September 11. The frozen
specification was not rewritten to claim 104/104.

Bare demonstratives, typed second service/worker/vehicle references, historical
reuse, changing preference, explicit withdrawal, restart, long conversation and
multi-request ambiguity have permanent regressions. A stronger supplementary case
found that the original benchmark only checked the first conditional date; it
did not require checking tomorrow after an empty result. The 105-case variant
retains the frozen 104 cases and requires two availability calls in order.
Results: **82/105 original baseline → 101/105 unmodified `855813a` → 102/105
conditional candidate → 102/105 final `eb826bca`**. Ordered fallback execution improved **0/1 → 1/1**.
The same three disclosed semantic/oracle discrepancies remain.

The repair preserves the explicitly stated alternative in the canonical date
fact. Only a current, recent, zero-slot result persisted by the real SQL tool can
authorize the new transition. It advances the canonical version once and
rechecks availability, using existing tools. Explicit correction/withdrawal wins;
no model call or automatic booking is added. The Production rollback transaction
proved version 1→2, first-date slots 0, second-date slots 3, stale/no-read
transitions denied, original commit replay preserving the advanced date, and
zero new bookings. The new fixed fifth actual-model probe tests this sequence
with synthetic read adapters; the real SQL evidence remains separately labelled.

## Multi-activity and memory proof

| Activity | Actual-model evidence | Actual PostgreSQL evidence | Important limit |
|---|---|---|---|
| Car wash | Existing full customer journey and goal/reference probes | Availability, booking, replay, reschedule, cancellation, memory | Real Meta round trip still missing |
| Salon | Typed second-worker reference retains service/goal | AT_BUSINESS booking and operational history | Synthetic QA service/worker context |
| Services | Duration question answered while retaining goal | AT_BUSINESS execution without car/vehicle requirements | Synthetic QA transaction |
| Laundry | PICKUP requires verified location | Verified GPS, PICKUP booking, history and mutation guards | Live laundry businesses have no configured services |
| Clinic | Medical diagnosis request escalates; no invented advice | No medical or clinic mutation claimed | Administrative semantic boundary only |
| Store | The deployed worker deterministically enforces an empty execution catalogue; no model call needed | One real persisted handoff and canonical action-required state through the actual worker, plus SQL replay proof | Goal remains UNKNOWN; no conversational retail order or changed delivery address is claimed |

Actual database proof uses existing activity ontology and guarded functions.
Salon/services/laundry each passed canonical load/commit, availability result
persistence, booking readback, duplicate replay, reschedule readback, cancellation
readback, verified memory, historical revalidation and backdated message denial.
Inapplicable checks are null, not counted as successful. Store produced one
handoff and zero duplicate handoffs, orders or appointments, then rolled back.

The active rollout remains one business at 100% canary; other businesses retain
their existing default shadow behavior. Multi-activity QA evidence therefore
does not imply a global live rollout across all businesses.

For a narrower numeric persistence measure, the retained salon/services/laundry
transactions contain **27/27 successful explicit load/commit/readback assertions**:
semantic load, commit, read-result persistence, booking/reschedule/cancel readback,
verified memory, historical context and historical revalidation for each activity.
This is a 100% observed SQL assertion rate over these synthetic transactions,
not an estimate of all real-customer state transitions or the phone path.

## Concurrency, provider failure and outbound truth

[Real concurrent DB run](https://github.com/barman-systems/pilot/actions/runs/34434592942):
three independent PostgreSQL sessions overlapped. One booking and one action
ledger row were created; the two competing calls returned the same booking as
idempotent replays. Delayed A was rejected with `SEMANTIC_SUPERSEDED` after B/C
advanced the message revision to 3. A second run on the integrated branch,
[34434950321](https://github.com/barman-systems/pilot/actions/runs/34434950321),
also passed. Cleanup readback showed zero remaining QA business/owner rows.

Three overlapping outbound reservations against an unverified synthetic Meta
connection were correctly denied, with zero new reservations. An earlier test
attempt failed the existing connected-requires-verification constraint and
cleaned up. No verification timestamp was fabricated. This is real fail-closed
connection proof, not successful outbound deduplication to an authorized phone.

The configured primary provider is Gemini `gemini-3.7-flash`, followed by Groq
`openai/gpt-oss-20b`, Cloudflare Workers AI, then the already configured Gateway
`google/gemini-3.7-flash`. Observed direct failures were HTTP 429, occasional Groq
schema 400 with bounded compatibility repair, and Cloudflare timeout. The exact
billing/rate cause of HTTP 429 was not established. Fallback preserves the same
canonical turn and has no direct tool authority.

On verified Production `855813a`, the retained goal/reference/multi-activity
subset contains **28/28 successful interpretations**, all through Gateway
fallback. Their reported cost totals **$0.060912**; observed latency is
6.684–11.040 seconds (mean 8.197 seconds), with at most 280 reasoning tokens.
This subset excludes optional provider comparisons and other probes; it is
not total account spend or the success rate of every production call. Direct
provider 429/timeouts remain a degraded-provider condition; fallback succeeds
within the existing shared deadline and authority boundary.

A manual evidence review of all **30 nonempty, nonmutating replies** in this
retained subset found **0 unsupported operational claims (0/30)**. The replies
and reviewer scope are retained in the JSON evidence. This narrow observed
rate does not assert zero hallucinated actions across all customers, mutations
or real-phone delivery.

Decision events retain conversation/business/activity context, goal, references,
missing facts, next action, tool/result, revision, provider/model, attempt/fallback,
latency and available usage/cost. Raw chain-of-thought is not stored. Large safe
provider traces live in canonical state; compact event metadata remains within
the existing database bound. Unknown monetary cost remains null.

## Real-phone WhatsApp proof

Read-only production aggregates still show the newest verified inbound at
2026-09-10 02:14:43 UTC, and newest outbound/read evidence on September 9.
The latest inbound stopped at the existing HUMAN_TAKEOVER guard. We preserved
the customer's human ownership. No post-change correlated inbound → mutation →
outbound → delivered/read chain from a real phone has been observed.

The stored Meta connection has a credential; the blocker is not a missing
GitHub, Supabase or Vercel login. The browser is at WhatsApp's **Scan to log in**
device-link screen, independently rechecked at **06:08:07 UTC** after the final
deployment. A final SQL aggregate refresh still found no newer inbound or
outbound event. The precise human step is to link an authorized independent test phone
through WhatsApp's device-link flow, or originate the agreed test conversation
from that phone. No QR authentication or message on the owner's behalf is
fabricated. Existing fixtures and direct API diagnostics are explicitly excluded
from real-device proof.

## Evidence files

- `DABBIR_UNSEEN_FINAL_855813A.json`: all 104 results, replies, checks and fixture tools.
- `DABBIR_FINAL_CONCURRENT_DB_EVIDENCE.json`: actual overlapping sessions, SQL readback and cleanup.
- `DABBIR_MULTI_ACTIVITY_DB_EVIDENCE.json` and `DABBIR_STORE_REQUEST_DB_EVIDENCE.json`: real activity SQL results.
- `DABBIR_FINAL_META_AGGREGATE.json`: current event aggregates without phone numbers or message bodies.
- `DABBIR_INTERMEDIATE_PRODUCTION_FAILURES.json`: exact-release failures retained rather than hidden by reruns.
- `DABBIR_REAL_MODEL_PRODUCTION_855813A.json`: verified actual-model multi-activity, provider and reply evidence.
- `DABBIR_REAL_MODEL_PRODUCTION_DDA4BEE2.json`: prior actual-model multi-activity evidence.
- `DABBIR_UNSEEN_FINAL_B9C9B0ED.json`: stronger 105-case benchmark rerun on the deployed source.
- `DABBIR_REAL_WORKER_CONDITIONAL_B9C9B0ED.json`: actual model→canonical state→SQL tools, date transition, retries and cleanup.
- `DABBIR_REAL_WORKER_CONDITIONAL_SETUP.sql`: reproducible isolated direct-worker setup; no Meta credential or dispatch token is exposed.
- `DABBIR_CONDITIONAL_AVAILABILITY_DB_EVIDENCE.json` and `DABBIR_CONDITIONAL_AVAILABILITY_PRODUCTION_SMOKE.sql`: actual guarded date transition and SQL read proof.
- `DABBIR_REAL_WORLD_VALIDATION.md`: chronological audit, confirmed defects and earlier verification stages.
- `DABBIR_UNSEEN_FINAL_EB826BCA.json`: final-source strengthened 105-case benchmark, including all raw discrepancies.
- `DABBIR_REAL_MODEL_PRODUCTION_EB826BCA.json`: final exact-release browser/application/model evidence and scoped reply review.
- `DABBIR_FINAL_RELEASE_EB826BCA.json` and `DABBIR_FINAL_CHECKS_EB826BCA.json`: exact release, CI checks, phone gate and runtime error aggregate.
- `DABBIR_REAL_BILLING_CRON_EB826BCA.json` and `DABBIR_BILLING_RELEASE_BRAIN_EQUIVALENCE.json`: actual scheduled cost reconciliation and unchanged brain/tool source proof.
- `DABBIR_FINAL_VALIDATION_SHA256SUMS.txt`: SHA256 checksums for the final evidence branch's audit files.

### Changed implementation and regression files

The deployed implementation changes are in `_dabbir-context-resolver.js`,
`_dabbir-semantic-engine-core.js`, `_dabbir-cognitive-dialogue.js`,
`_dabbir-goal-queue.js`, `_dabbir-brain-contract.js`,
`_dabbir-understanding-orchestrator.js`, `_dabbir-whatsapp-ai-core.js`,
`_dabbir-activity-intelligence.js`, `_dabbir-semantic-interpreter.js`, and the
cognitive/multi-activity probe modules under `api/`.

Permanent deployed regressions are in `test/dabbir-real-world-hardening.test.mjs`,
`test/dabbir-production-brain-regression.test.mjs`,
`test/dabbir-understanding-v2-orchestrator.test.mjs`,
`test/dabbir-single-delivery-mode-authority-regression.test.mjs`,
`test/dabbir-semantic-gateway-reasoning-budget-regression.test.mjs`, the frozen
`unseen-spec.mjs`, and the required probes in `test/ai-full-customer-journey-v2.mjs`.
PR #692 additionally changes the semantic core/orchestrator and fixed multi-activity
probe, adds `test/dabbir-conditional-availability.test.mjs`, extends the unseen
runtime runner, adds two negative Gateway cases, and includes the additive
conditional-date migration and its actual SQL proof.

Real PostgreSQL concurrency lives in `scripts/dabbir-brain-real-db.mjs`,
`test/fixtures/understanding/production-concurrency-setup.sql` and
`.github/workflows/dabbir-brain-real-db.yml`. The independent benchmark runners
are `scripts/dabbir-unseen-evaluate.mjs` and `scripts/dabbir-unseen-runtime.mjs`.

### Earlier exact-release results

Workflow [34436236376](https://github.com/barman-systems/pilot/actions/runs/34436236376)
completed successfully on exact Production `855813a`: Arabic **35/35**, English
iPhone **33/33**, iPad WebKit passed, tenant/WhatsApp isolation **13/13**, and all
QA cleanup passed. The release was locked at 04:14:09 UTC and rechecked unchanged
at 04:27:40 UTC. Artifact `10136614461` SHA256:
`ce6e4468d301b6695e2786eef0ccca92d2d94e86dc00dcc5a21c7ec012e69210`.

The intermediate release **`b9c9b0ed3b90bde29a64c73ca7b22bd63d2830b1`** independently
passed [workflow 34440762057](https://github.com/barman-systems/pilot/actions/runs/34440762057):
Arabic **35/35**, English iPhone **33/33**, iPad WebKit passed, tenant/WhatsApp
isolation **13/13**, all QA cleanup passed. The release was locked at
**05:23:30 UTC** and rechecked unchanged at **05:36:31 UTC** on deployment
`dpl_AGrYTSHtu8fvyu63y3qSMRkUpGDZ`. Artifact `10138172368` SHA256:
`751e3fb42bb8d1b69e43d2d0c7072e8ec5b4a1ead2701f04b9ba19fcfabdb5ce`.
Three optional direct-provider comparisons failed and remain recorded; they were
never counted as required passes. Main CI independently ran **2692/2692** tests,
zero failures/skips and zero production dependency vulnerabilities.

## Direct deployed worker: model + canonical state + real SQL

A new isolated QA fixture invokes the existing deployed worker through its own
server-generated dispatch token. It has no phone or Meta connection, and does
not fabricate a signed inbound or a delivered slot offer. This is direct worker
evidence, not a real WhatsApp round trip. The ordinary worker loads the QA
customer/business/activity from PostgreSQL and calls the configured providers.

The unmodified `855813a` run reproduced the conditional-date defect with a real
model: Gemini 429, Groq bounded schema-repair 400 then 200, BOOK_SERVICE retained,
canonical version 1/date September 10, real persisted CHECK_AVAILABILITY result
with zero slots, no second date read. Delivery correctly failed with
WHATSAPP_TENANT_CONNECTION_NOT_FOUND; zero outbound reservations or new bookings.
The existing busy QA appointment was the only appointment. Guarded cleanup
readback returned zero QA businesses/owners. Evidence:
`DABBIR_REAL_WORKER_CONDITIONAL_BASELINE_855813A.json`.

On exact Production `b9c9b0ed`, the same isolated setup passed: actual Gateway
fallback interpreted the message, canonical version advanced 1→2 and date
September 10→11 after the first empty read, and the second real SQL availability
read returned 3 slots. BOOK_SERVICE and the known service/time were retained.
There were zero new bookings or outbound reservations; delivery stopped at the
existing missing-Meta-connection gate. The provider trace reports 4 HTTP requests
in 9.073 seconds and $0.00255825 for the final request. This directly connects
the deployed model, worker, canonical state and actual SQL read transition.
It still does not prove a delivered WhatsApp message or confirmed booking from
a real phone. Two additional dispatches retried the same batch through the real worker.
After three attempts, version 2/date September 11 and exactly one date
transition remained; availability was re-read safely, with zero new bookings
or outbound reservations. Both additional HTTP responses were 202. Cleanup
readback found zero QA businesses/owners. All 12 explicit checks passed in
`DABBIR_REAL_WORKER_CONDITIONAL_B9C9B0ED.json`. These dispatches are retry proof;
independent overlapping PostgreSQL sessions provide the concurrency proof above.

## Store request through the deployed worker

On `b9c9b0ed`, a separate isolated store customer asked to change the delivery
address of a prior order. The current store fixture had no configured execution
catalogue or verified previous order. The ordinary worker selected HANDOFF
without an unnecessary model call, persisted exactly one handoff, set the
conversation to action_required and canonical pending_action to handoff, and
finished the batch HUMAN_REQUIRED. Repeating the dispatch returned without
reprocessing (attempt_count stayed 1); handoffs remained 1, and orders, bookings
and outbound reservations remained 0. All 9 explicit checks, including guarded
cleanup, passed in `DABBIR_REAL_WORKER_STORE_B9C9B0ED.json`.

The goal field remains UNKNOWN. This is an explicit capability boundary and
durable request escalation, not proof of a retail order engine, a modified
delivery address, or resolved previous-order identity. The setup is retained in
`DABBIR_REAL_WORKER_STORE_REQUEST_SETUP.sql`.

## Evidence boundaries for the requested phone chain

| Boundary | Evidence obtained | Remaining condition |
|---|---|---|
| Real phone → Meta → signed webhook | Existing verified inbound/status ledger and permanent signature/duplicate-webhook tests | No correlated post-release real-phone inbound/outbound round trip yet |
| Deployed worker → trusted customer/business/activity → model → canonical state | Actual isolated salon worker run on `b9c9b0ed`, stored real provider trace and canonical readback | The inbound was a labelled QA message, not Meta delivery |
| Canonical decision → availability → next-date transition → SQL result | Actual zero-slot read, guarded version 1→2 transition, second-date three-slot read and repeated worker attempts | No missing implementation gate in this verified read path |
| Booking/reschedule/cancellation → database truth | Existing guarded real SQL transactions, actual receipts/readback and independent concurrent sessions | The slot-presentation fixture is synthetic; real-phone confirmation remains unproven |
| Store request → durable team handoff | Actual deployed store worker, one persisted handoff, duplicate dispatch did not reprocess | No retail order mutation claimed |
| Response → Meta → real phone | Existing outbound guards and denied unverified-connection tests | Link an authorized independent test phone and complete the real conversation |

The aggregate success of these layers is not represented as a fabricated
real-phone chain. Real-device acceptance retains this outstanding
phone gate. The discovered billing regression is now closed by the verified
scheduled cron below. The precise human action is to link an authorized
independent test phone through the open WhatsApp device-link screen. The agent
can then perform the technical test and correlate the resulting message,
canonical transition, action receipt and delivery/status records. Existing real
customer conversations under human takeover must remain untouched.

## Final provider and reply measurements

The final `eb826bca` release's retained goal/reference/five-activity model probes passed
**30/30** interpretations via the configured Gateway fallback. Reported final
request cost for that subset is **$0.066093**, with no unknown-cost sample in
that subset; latency **7.108–13.158 seconds**, mean **8.103 seconds**, maximum
reasoning-token count **559**. The separate direct worker proof and optional
provider comparisons are excluded from those totals. Prior baseline worker
execution also demonstrated successful Groq compatibility repair; direct
provider availability remains intermittent, and HTTP 429 billing/rate causes
were not independently established.

Every nonempty reply in the retained current-release subset was independently
read: **0 unsupported operational claims among 34 nonmutating replies (0/34)**.
This narrow measurement, and the zero duplicate mutation in actual concurrent
SQL proof, must not be promoted to unmeasured population-wide or real-phone
rates. Detailed current evidence: `DABBIR_REAL_MODEL_PRODUCTION_EB826BCA.json`.
The Arabic and English labels identify the browser journeys; the retained fixed
semantic probes use the same Arabic customer utterances in both runs. Their
counts are repeated actual executions, not 30 distinct unseen conversations.

The 105-case deployed-source benchmark reports goal accuracy **12/12 (100%)**,
entity accuracy **154/155 (99.35%)**, reference resolution **28/28 (100%)**,
carryover **70/71 (98.59%)**, next action **66/68 (97.06%)**, tool selection
**19/20 (95%)**, unnecessary questions **0/44 (0%)**, and conditional read
sequence **1/1 (100%)**. These are assertion denominators, not 105 labels for
every metric. The same stricter baseline had goal **11/12**, entities **148/155**,
and conditional sequence **0/1**; other baseline denominators are in the table.
The raw end-to-end hallucination and persistence rates remain null in the
fixture benchmark; separate scoped real-response/SQL measurements are above.

Post-diagnostic readback verified zero residual worker QA businesses, exactly
one existing rollout row, the actual migration ledger entry, and no execute
privilege for anon/authenticated. Evidence: `DABBIR_FINAL_MIGRATION_AND_CLEANUP.json`.

## Platform-wide readiness and billing side effect

The separate BAR-12 launch gate is **BLOCKED with 12 blockers**, both on starting
`986379a1` (run 34396326137) and verified brain release `b9c9b0ed`
(run 34440762022). Every gate state matches the baseline. The blockers include
the real external reply/voice chain, aggregate connection/handoff/feedback
measurements, alert/monitoring review and explicit security/financial/legal
launch review. No BAR-12 gate or result was weakened or manually promoted.
`DABBIR_PLATFORM_READINESS_BASELINE_AND_FINAL.json` retains both complete reports.
These platform launch prerequisites are distinct from the current conversational
brain test scope and must not be described as fully cleared.

The exact-release runtime log audit found no semantic-contract rejection but
two billing cron errors at 05:30 and 05:35 UTC. Real-model QA spend remained in
the provider report after the QA tenant's guarded deletion. The existing SQL
reconciliation RPC correctly rejected the absent business and stopped the cron.
The earlier 855813a verification window had no matching billing error. The
failure was reproduced in an actual rollback-only SQL call.

PR #693 now resolves provider report UUIDs from the trusted database before
writing, reconciles existing businesses using unchanged RPC/idempotency keys,
and reports unattributable spend explicitly as PARTIAL_UNATTRIBUTED. Lookup,
provider-report and live-tenant ledger errors still fail closed. Seven permanent
transport regressions were added; full suite **2699/2699**, syntax passed. No
additional migration/dependency or conversational change. Both the actual
scheduled production cron and exact-release journey are now verified below.

## Billing correction on Production

PR [693](https://github.com/barman-systems/pilot/pull/693) merged as
`eb826bca7f08b7b5b58bba06639f31b21a23c0c4` and deployed to
`dpl_8svUgU3GKcWENuoaYjpwdUFgFLVT`. The actual scheduled cron at **06:00:20 UTC**
returned **HTTP 200**, state **PARTIAL_UNATTRIBUTED**, with **1 unassigned
business / 7989 micro-USD ($0.007989)** from the provider report. No live-business
row was present in this cycle, and no customer ledger amount was fabricated or
transferred. This replaces the repeated absent-business HTTP 400 failure while
keeping the orphan spend visible. Evidence: `DABBIR_REAL_BILLING_CRON_EB826BCA.json`.

Only the cost cron, its tests and its audit note changed from `b9c9b0ed`; all
brain/tool modules and the canonical migration are byte-identical. This is
recorded in `DABBIR_BILLING_RELEASE_BRAIN_EQUIVALENCE.json`. The new exact-release
journey is run [34442947321](https://github.com/barman-systems/pilot/actions/runs/34442947321).
It completed successfully at **06:10:39 UTC**: Arabic **35/35**, English iPhone
**33/33**, iPad WebKit passed, and tenant/WhatsApp isolation **13/13**. All retained
QA cleanup checks passed. The exact SHA/deployment was locked at **05:56:40 UTC**
and rechecked unchanged at **06:10:34 UTC**; an independent release endpoint
readback agreed at **06:11:31 UTC**. Artifact `10138969446` SHA256:
`bb3d015230f5bc092b8e23511956dd8bdf4514960efcda42d1a0d1e49f4d69c3`.

The exact-deployment runtime query for **05:57:00–06:10:40 UTC** returned zero
error/fatal log entries. This is a scoped log observation, not a guarantee that
every production call succeeded. Three optional direct-provider comparisons
still failed; the required semantic path succeeded through Gateway fallback.
The required main CI, security, governed lineage, independent verifier, protected
iPhone smoke, persistent execution and Trigger.dev checks completed successfully.
Capacity/manual guardian jobs were skipped under their existing conditions and
are not reported as passed. The separate BAR-12 result was not reclassified.

No further application change is included in this final evidence branch. The
verified Production SHA remains fixed while the audit artifacts are published
for review. The complete real-phone round trip must still be run after the
authorized independent test phone is linked; successful fixtures, live SQL
transactions and direct worker dispatches are not substitutes for that evidence.
