# Cognitive dialogue repair — 2026-09-09

## Live service inquiry and presentation continuity — 13:52 UTC

Production validation of #674 did not establish strict-format reliability: Groq returned 400 for one request and HTTP 200 with an application-invalid contract for another. Keep these failures visible. Record fixed contract failure categories without output text, and allow exactly one retry in the previously supported JSON-object format after strict-format rejection. Both formats pass the identical application validator; this is transport-format compatibility, not an authority fallback. The interpreter's existing total deadline and four-request ceiling still apply. Do not retry authentication, quota or network failures this way.

**Root cause:** An actual customer asked `شو خدماتكم`, then `غسيل عادي كم الوقت؟`, then `3`. The two price lists were provider-verified READ, but both older batches were superseded by the next inbound before the post-send pending-state acknowledgement finished. The saved ordered menu remained `presented:false`, so the ordinal had no verified referent. The application correctly refused to guess, but delivery proof and dialogue state were unnecessarily coupled to the old batch's execution lock.

**Why the existing architecture failed:** Service inquiry only exposes catalog/pricing/approved knowledge actions, despite already loading service duration. It has no structured facet for the customer's specific service question. Separately, a delivered read-only menu can outlive the turn that displayed it; its proof should not require a superseded turn to regain execution authority.

**Change and generalization:** Stamp the staged ordered service presentation with server-owned batch/version/branch provenance. On the next authorized context load, recover only an unexpired menu whose exact outbound key has a SENT or provider-verified DELIVERED/READ receipt in the same business, conversation, customer and branch. Do not mutate the old batch, refresh expiry, recover booking approvals, parse a menu from text, or weaken supersession checks. Preserve original ordinal positions when a catalog item becomes unavailable. Add a structured service-question facet that reads price/duration from the current scoped catalog; it cannot supply values or execute an action. Side inquiries preserve the booking target.

**Verification and regression prevention:** Reproduce the superseded-after-delivery race with real SQL and a second batch. Deny unverified/foreign/expired/wrong-key receipts and unrelated pending actions; prove an old batch still cannot execute. Exercise service removal without ordinal renumbering, duration/price inquiries, missing values and active-booking side questions. Production diagnostics must use the actual interpreter and disclose their synthetic scope; live customer delivery is a separate evidence level.

A further regression reproduced a stale menu overriding the current question: after a full natural-language booking request selected a service, `choose_service` remained alive because only exact/ordinal catalog selections consumed it. A later numeric answer selected a different service from the old menu. Consume the menu whenever a scoped active journey has a verified service, and prevent an older menu ordinal from outranking an active non-service question. Exact service corrections still pass the normal catalog/contract path. This is tested as a five-turn conversation before and after the change.

## Baseline and root cause

Live GitHub main and production at 11:54 UTC: `9b949c37d3f3ff2d6a01c2d565e6502c5e6da189`, deployment `dpl_ASBm8dcpLqp6iKRiSyDzkNCdUHXA`.
Production message/event readback, 10:09 UTC, confirms the reported sequence verbatim: service discovery → exterior wash request → vehicle question → `ستيشن` → generic menu.
The third UNDERSTOOD event records `semantic_override=SUPPORT`, `NO_OPERATIONAL_AUTHORITY`, and missing_count=0. The same service and MOBILE car-wash contract remained attached. This was not a missing vehicle keyword: the existing reducer already recognizes that value.

The orchestrator's proposalConflicts/proposalOverrideBase treats a confident per-turn model intent as authority to clear goal, intent confirmation, missing requirements and pending action. Its bounded planner snapshot omits the prior clarification field/question. Only date/time/binary confirmations have a hand-written continuation shortcut. No delivery quality gate reconciles the reply with the retained journey. Separately, pricing shares the mutable service entity with booking, and generic change wording can incorrectly become RESCHEDULE_BOOKING.

## Change justification, before implementation

Preserve the existing semantic version, fact provenance, compare-and-swap commits, batch locks, scoped contracts, SQL action authority and receipts. Add a bounded, inspectable cognitive view and a general pending-field resolver over those facts. A model proposes turn role and candidate changes; it cannot erase an active goal merely by proposing SUPPORT. A side question gets its own read target, with the booking goal retained. Before delivery, a deterministic quality gate rejects generic/reset/redundant decisions and replans against the current contract.

This repairs a class of failures across configured requirements, not a vehicle keyword. Date, resource, service, location and other permitted fields all use the same continuation/merge rule. Inferred facts remain non-executable. Topic changes and destructive actions still require explicit grounded intent and existing SQL checks.

Golden cases exposed two additional continuity faults: an explicitly stated 24-hour time lost its known day period during a later hour correction; and answering a different required field still counted as a failed repeated question. Preserve the period derived from the customer's exact clock and reset failure counters on grounded progress in any required field. Neither change invents availability or relaxes execution authority.

## Verification and release prevention

First reproduce the exact three-turn failure through the real orchestrator with an adversarial SUPPORT proposal. Add multi-turn golden cases, including corrections, side questions, missing/foreign/stale memory, activity differences, provider failures and duplicate/stale turns. Keep full existing safety tests. Distinguish deterministic replay, live model calls, production RPC/browser proof, and real WhatsApp delivery. No mock is production proof; no rollout expansion based on unmeasured SLOs. Persist metrics without message text, coordinates, customer names or credentials.

## Acceptance limits

## Live receipt advancement regression

At 2026-09-09 13:30 UTC an actual WhatsApp greeting was understood and its reply delivered with provider_verified=true. The cognitive presentation gate accepted only reservation state SENT. A signed delivery webhook advanced the row to DELIVERED, so the same-batch presentation check rejected stronger evidence and left the batch retrying with COGNITIVE_PRESENTATION_UNVERIFIED. Synthetic delivery stubs and a SQL fixture fixed at SENT missed this race.

Accept SENT or provider-verified DELIVERED/READ while retaining the exact business, conversation, batch, provider ID, lock, state-version and idempotency checks. SENDING, unfinalized PROVIDER_ACCEPTED, FAILED, AMBIGUOUS and unverified terminal states remain denied. SQL regressions cover advancement, negative states, wrong-batch receipts and idempotent presentation; then observe recovery through the existing worker. This fixes delivery state progression for every activity without changing booking authority or manufacturing an inbound message.

## Bounded multi-goal continuation

Root cause: one mutable entity map and one intent cannot represent two independently requested jobs. Parsing an entire multi-request message can bind the second job's date or service to the first. The existing secondary_goals array has no runtime owner.

Change: let the existing interpreter propose at most three non-overlapping exact request spans. Ground each span through the existing pure reducer, require explicit confirmed intent, and retain separate scoped semantic frames. Only the first frame reaches the current execution loop; later frames persist under the existing versioned commit. A queued frame resumes on a later turn only after the preceding action has a matching database outcome and provider-accepted completion. Slot and appointment confirmations never transfer between jobs, and service/branch authority is revalidated on resume. Models do not write frames or receipts.

This generalizes across activity contracts without vehicle-specific branching. Cover distinct services/dates, booking plus rescheduling, side questions, corrections, duplicate spans, ungrounded spans, stale/foreign frames, missing execution/delivery proof, and removal of a queued service. This initial bounded queue does not claim same-turn execution of several mutations or arbitrary multi-party planning.

Queued cancellation/rescheduling also pins the original scoped appointment candidate set. Otherwise creating the first booking could make that new appointment become the sole candidate for an older deferred request. Resume intersects the original candidates with fresh authorized DB rows; it never treats a newly created appointment as the old requested target.

The failed live model comparison also exposed a diagnostic-adapter gap: recoverable provider errors invoke the canonical failure-checkpoint RPC, which the synthetic probe did not model. The probe then replaced useful provider evidence with a generic diagnostic error. Model that local checkpoint explicitly, stop on the first failure, and retain bounded status/latency/token evidence. Business mutation RPCs remain forbidden.

## Model comparison and telemetry follow-up

The isolated Groq comparison exposed a failed-turn persistence defect: the interpreter outage on a side question left service_retained=false. The initial deterministic pass can tentatively select a catalog item before the model resolves the role of the message. The failure-checkpoint path persisted that provisional state even though interpretation never completed. Reproducing a third-call provider failure confirmed the service changed locally as well.

When an established scoped journey is awaiting interpretation and the provider fails, checkpoint the previous validated journey, retain its fact provenance, pending question, expiry and queued requests, and mark cognition as retry/wait. The original batch remains available for re-interpretation. Existing SQL removes slot authority, disables intent confirmation and performs the same version/scope checks. First-turn checkpoints and resolved deterministic pending answers retain their existing behavior. This transactional boundary applies to all failed interpretations, not a keyword, activity or provider.

Root cause: the existing metering wrapper captures usage and request latency but discards them when a synthetic probe has no tenant ID. The provider readiness endpoint reports configuration, not comparative understanding. Add bounded telemetry to the existing interpreter result and allow only fixed cognitive scenarios against already configured providers. A comparison request isolates the requested provider so failover cannot be mistaken for that provider succeeding. No credentials are returned, no environment is mutated, no provider is added, and production model priority is unchanged. Test provider isolation, missing-cost semantics and both fixed scenarios before comparing live results.

The production English iPhone owner journey failed while choosing a business: the option existed but its menu became hidden. The workspace UI exposes an enabled switch before asynchronous restore completes, and schedules overlapping initialization twice. Restore calls switchBusiness, which closes the menu and loads runtime while a user can already be selecting. Make initialization single-flight, keep the selector disabled until the authorized portfolio restore settles, and make the browser journey wait for that readiness before opening the sidebar. This fixes the initialization race without forced clicks, longer timeouts, or bypassing the actual selector. Re-run the existing real browser booking/receipt gate.

The five-turn comparative case exposed a remaining dialogue defect: answering a side-price question increments the unanswered booking-field counter while recomputing the resumable journey, eventually handing off a normal conversation. An evidenced side question is not an extraction attempt. Preserve that counter for side questions while retaining the existing escalation threshold for actual failed answers. Verify repeated side questions and repeated unresolved answers separately.

The first CI advisor gate rejected the private rollout table's implicit RLS default deny as `rls_enabled_no_policy`. Add an explicit restrictive deny-all policy, retaining revoked client ACLs and the postgres-owned loader. This documents and preserves the actual access boundary; it does not raise the advisor baseline or weaken a gate.

The requested 98–99.5% SLOs need measured denominators; small test suites cannot establish population reliability. A live external WhatsApp journey requires an authorized test recipient and verified delivery receipts. Pending source work and missing evidence are not automatically external blockers.
# Provider contract enforcement — 2026-09-09

**Root cause:** Production QA on main `7637a8c` recorded HTTP 200 from Groq followed by `INVALID_JSON_CONTRACT`; the bounded chain then exhausted other configured providers (429/timeouts). The adapter only requested `json_object`, which constrains JSON syntax but leaves the interpretation schema to the prompt. Raw customer/model content was not logged, so the individual invalid field is unknown.

**Why the architecture failed:** The application correctly rejects malformed interpretation, but the existing provider's constrained-decoding capability was never connected to that same contract. An avoidable malformed proposal consumes a provider attempt and customer latency. This is separate from quota failures and semantic mistakes.

**Change and generalization:** Publish the shared interpretation shape as a strict JSON schema to the existing Groq `openai/gpt-oss-20b` endpoint only. All activities use the same contract constants. Other endpoints/models retain their existing format until their compatibility is verified. The model, budget, provider order, timeouts, grounded-entity validation and execution authority stay unchanged. This improves structural conformance; it does not prove understanding or resolve 429s.

**Testing and regression prevention:** Assert the actual interpreter request carries the strict schema, exercise schema-conforming but ungrounded proposals through the real interpreter, retain malformed/truncated response fallback tests, and run the required production cognitive conversation gates on the exact deployed SHA. Source: [Groq Structured Outputs](https://console.groq.com/docs/structured-outputs), checked 2026-09-09.
