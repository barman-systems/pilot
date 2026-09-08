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
