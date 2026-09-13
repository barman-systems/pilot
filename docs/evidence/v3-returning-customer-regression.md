# Returning-customer regression after PR #729

Status: proposed correction; production acceptance and independent Red Team review remain open. This does not close #726 or establish that the broader cognitive mission is complete.

## Production evidence, 2026-09-12 UTC

The production release endpoint and GitHub main both identified `7645f9df82fc8c365f42451b949f387ec24db3d5` during investigation. This is a current production conversation failure, distinct from the superseded CI failure on `8020f4e`.

- 14:58:16: the returning customer sent a greeting. At 14:58:21, a newly generated AI message repeated a vehicle question containing the previous day's WhatsApp location rendering.
- 14:58:24: the customer requested a wash now. Its first attempt recorded `V3_INTERPRETER_CONTRACT_INVALID`; its second attempt completed at 15:00:28 with the same incorrect vehicle question.
- Persisted state identified `engine=V3`, `interpreter=V3_INDEPENDENT`, `response_source=CONVERSATION_BRAIN_V3`, and `legacy_dialogue_called=false`. The response was newly produced by V3, rather than replayed from an older outbound message.
- The episode began the previous day. A provider-verified location with a receipt coexisted with a null vehicle tentative whose `CURRENT_TURN_SURFACE` was exactly the transport's rendering of that location.
- The greeting continued the old booking and advanced `last_turn_at`. The following request therefore appeared only 7.471 seconds after the previous turn instead of after the approximately 22-hour operational gap.

No customer identifiers or actual coordinates are included in this fixture. The fixture uses synthetic scope IDs and coordinates with the same structure and rounding behavior.

## Causes addressed

1. Persisted evidence was copied into the interpreter and planner without reconciling a known cross-field provider-evidence contradiction. Preventing new contamination in #729 did not repair existing contaminated state.
2. An active booking goal overrode a social speech act. With complete prior facts, a greeting could even reach the authority execution branch. The regression harness rejects any such authority call; no production booking execution from a greeting was established.
3. Social turns refreshed the only clock used to decide whether a subsequent request belonged to the previous episode.
4. Explicit `NEW_REQUEST` for another booking reused the old episode when the goal names matched and the last turn was recent.

## Proposed behavior

- Reconcile tentative evidence before interpretation. Remove a null unmapped tentative only if its source and resolution identify the old pending-surface path and its exact transport rendering matches a stored signed-provider location fact with a receipt. Record the reason and receipt. Do not promote text to GPS, remove verified facts, or remove unrelated/unproven tentatives.
- Process a social-only semantic turn as a reply. Keep its episode facts and pending proposition available for a subsequent actual answer. Represent tentative deferral explicitly; the invariant continues to reject hiding a tentative in an operational plan.
- Persist a separate `last_operational_turn_at`. Greetings do not refresh it. Older snapshots fall back to their known `last_turn_at`; the patch does not invent missing historical timing.
- Start a fresh episode for an explicit operational `NEW_REQUEST`, including another booking. Direct answers and confirmations retain their continuation behavior.
- Supply the operational timestamp and reconciliation reasons to the interpreter. Add speech-act and invalidation fields to existing semantic metrics without storing customer text in those fields.

The response renderer remains deterministic. This patch is not a redesign into a general autonomous business operator. It changes state and speech-act handling, not vocabulary rules for the example messages.

## Verification and limits

- Initial 11-case regression set on the production tree: 6 failed, 5 passed. The six failures included the repeated location-as-vehicle question, the clock reset, social resumption of a ready booking, and disruption of a pending confirmation.
- A further explicit same-goal new-request case failed after the initial correction, then passed after correcting episode classification.
- Final regression set: 15/15 passed.
- V3 suite: 76/76 passed.
- Full local suite: 2990/2990 passed, zero skips or cancellations.
- Existing tests and CI assertions were not relaxed. The new invariant case rejects tentative deferral when an action, question, answer, or surfaced operational fact makes it inappropriate.

The regression harness calls `runConversationV3Runtime` and `interpretConversationTurnV3`, then checks committed state, rendered response, and RPC calls across sequential turns. The semantic provider, database RPCs, and WhatsApp delivery are isolated fixtures. These results establish application behavior given those semantic outputs; they do not prove live-model interpretation or a real-phone journey.

The reason for the first provider contract rejection was not recoverable from the scoped runtime logs. Its retry succeeded in processing but still produced the state-driven bad reply. Provider-contract reliability remains open. Independent adversarial review and an unscripted phone acceptance trace on the proposed deployment remain required before claiming closure.

## Acceptance and rollback

Acceptance must link the deployed SHA, actual inbound and outbound receipts, interpreted role/action, episode boundary, evidence reconciliation, and authority result for a returning customer who greets, starts a new request, answers a pending question, and changes their mind. A successful build or fixture alone is insufficient.

The proposed change contains no DB migration, transport change, booking writer change, or production conversation reset. Before rollout, rollback is simply withdrawal of the draft. After an authorized rollout, revert this change through the normal PR gates. The added timestamp is backward-compatible. Audit history remains the evidence for a removed invalid tentative; rollback must not reconstruct contaminated evidence or claim to restore a previous conversation snapshot.
