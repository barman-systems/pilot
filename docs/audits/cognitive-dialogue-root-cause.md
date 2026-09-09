# Cognitive dialogue repair — 2026-09-09

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

## Model comparison and telemetry follow-up

Root cause: the existing metering wrapper captures usage and request latency but discards them when a synthetic probe has no tenant ID. The provider readiness endpoint reports configuration, not comparative understanding. Add bounded telemetry to the existing interpreter result and allow only fixed cognitive scenarios against already configured providers. A comparison request isolates the requested provider so failover cannot be mistaken for that provider succeeding. No credentials are returned, no environment is mutated, no provider is added, and production model priority is unchanged. Test provider isolation, missing-cost semantics and both fixed scenarios before comparing live results.

The production English iPhone owner journey failed while choosing a business: the option existed but its menu became hidden. The workspace UI exposes an enabled switch before asynchronous restore completes, and schedules overlapping initialization twice. Restore calls switchBusiness, which closes the menu and loads runtime while a user can already be selecting. Make initialization single-flight, keep the selector disabled until the authorized portfolio restore settles, and make the browser journey wait for that readiness before opening the sidebar. This fixes the initialization race without forced clicks, longer timeouts, or bypassing the actual selector. Re-run the existing real browser booking/receipt gate.

The five-turn comparative case exposed a remaining dialogue defect: answering a side-price question increments the unanswered booking-field counter while recomputing the resumable journey, eventually handing off a normal conversation. An evidenced side question is not an extraction attempt. Preserve that counter for side questions while retaining the existing escalation threshold for actual failed answers. Verify repeated side questions and repeated unresolved answers separately.

The first CI advisor gate rejected the private rollout table's implicit RLS default deny as `rls_enabled_no_policy`. Add an explicit restrictive deny-all policy, retaining revoked client ACLs and the postgres-owned loader. This documents and preserves the actual access boundary; it does not raise the advisor baseline or weaken a gate.

The requested 98–99.5% SLOs need measured denominators; small test suites cannot establish population reliability. A live external WhatsApp journey requires an authorized test recipient and verified delivery receipts. Pending source work and missing evidence are not automatically external blockers.
