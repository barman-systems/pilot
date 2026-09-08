# WhatsApp semantic contract incident — 2026-09-08

Production main at discovery: `b68be0f379a8c5ff63ebbc395836c1b12c4d9f4c`.

The reported message «فاضين بكره 9 الصبح» arrived at 18:10:11 UTC. The scoped database batch reached HUMAN_REQUIRED after two attempts at 18:10:25 UTC. Its saved semantic checkpoint identifies `AI_PLANNER_CONTRACT_INVALID`, not a verified provider outage. Recovery state is retained. No customer identifiers or raw provider output are included here.

## Root defects

1. The operational interpreter called the customer reply generator. Its higher-priority system instruction required a short sentence with a 25-word limit, while the lower-priority message requested a multi-field JSON object. No JSON response format was requested and the completion limit was 320 tokens.
2. HTTP 200 was treated as provider success before checking whether the reply was a usable interpretation. Invalid JSON therefore skipped configured-provider fallback and failed later in the WhatsApp parser.
3. When AI corrected a deterministic intent, the orchestrator cleared batch messages to avoid repeating the conflicting deterministic classification. This also removed the evidence used to validate extracted date/time facts.
4. The production test checked a generic «قل جاهز فقط» response. That verified generation availability, not the WhatsApp interpretation contract.

The saved error proves contract rejection. Historical raw output was intentionally not logged, so its exact contents and whether it was truncated cannot be asserted.

## Changes

- Dedicated internal semantic system contract and JSON output mode, bounded completion budget, strict validation before accepting a provider, and bounded fallback on invalid/truncated output.
- The shared WhatsApp interpreter receives sanitized context as data, separate from trusted instructions. Ordinary customer reply instructions and contact protection remain in effect for ordinary replies.
- Current-message evidence survives an intent correction; it remains subject to exact-quote verification and deterministic grounding. AI inference still cannot authorize a mutation.
- The existing same-origin authenticated synthetic endpoint has a fixed semantic probe that runs the same interpreter as WhatsApp. Production journey checks booking intent, tomorrow's date, 09:00, and absence of an invented service. No customer data, WhatsApp sends or booking tools are used by this probe.
- Applies across activities; operational requirements remain owned by the existing Activity Layer and database gates.

No database schema changes or migration edits. No customer state was manually rewritten. No human takeover was overridden. No safety or CI gate was disabled.

## Verification

Regression cases cover malformed/empty/prose/truncated provider responses, fallback, all-provider failure, sanitized context, ordinary reply guard preservation, and current-message evidence after intent correction. Full CI, exact deployed SHA and live structured probe results must be checked on the merged release. A live structured probe is not evidence that a real WhatsApp delivery/booking completed.

## Follow-up from the first live structured probe

PR #624 deployed as `d6e00b9df559ca0e3f88dcd81defcd6d1911c8ec`, deployment `dpl_fnXXManEZS47MYHJRQsMUCFjF39R`. Workflow 34263336032 / job 102186471848 failed the real structured probe at 18:32:11 UTC: Groq returned valid interpretation with booking intent, date and time correct, but `unknown_service=false`. The gate correctly rejected an unsubstantiated service selection. The exact model service name was not included in diagnostic output.

The follow-up requires a current-message service mention matching a scoped catalog name before retaining the proposal. Catalog membership alone cannot establish selection. Missing, invented, unrelated or out-of-scope service evidence drops that proposal while preserving correctly interpreted date/time and existing verified semantic state. Owner-approved aliases and verified memory remain resolved by the existing engine. The production assertion is unchanged; it must pass through the same grounding now used by WhatsApp.

The follow-up also grounds a numeric clock immediately followed by a daypart inside a sentence (e.g. «بكره 9 الصبح»), without requiring «الساعة». A quantity such as «9 سيارات الصبح» cannot become a verified time. Full-sentence AI evidence remains valid after intent correction. Probe confidence checks now meet the engine's actual interpretation thresholds.

## Operational probe correction

On merged #626 (`57813e100a1b3ce519099808e3d933a261b1ade4`), live job 102190719149 passed the four interpretation checks on all three calls. The first two probe calls passed; the third failed the additional provider `riskLevel === LOW` condition, which was not included in its diagnostic fields. The exact returned risk label was not recorded. The application itself permits MEDIUM proposals to resolve safely to CLARIFY and rejects HIGH proposals through HANDOFF.

The probe now runs the real pure semantic reducer on an explicitly synthetic in-memory activity fixture and requires CLARIFY with service missing, date/time grounded as CUSTOMER_STATED, and no verified action. HIGH/HANDOFF still fails. The existing four interpretation checks remain, including confidence thresholds. No runtime policy, mutation permission, provider fallback or customer state changes are made by this probe correction. Diagnostic output includes the proposed risk and actual policy action. This is a real-provider plus pure-engine test, not a real WhatsApp transmission or production booking.
