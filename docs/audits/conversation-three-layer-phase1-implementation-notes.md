# DABBIR Conversation V3 — Phase 1 Shadow Implementation Notes

Status: implementation branch only; no merge; no Production behavior change.

Phase 1 introduces only independent V3 shadow modules and tests. The legacy dialogue path remains the visible path.

Hard code invariants:

- `assertFactRetentionV3` compares verified facts before/after each V3 turn snapshot and throws `V3_FACT_RETENTION_VIOLATION` if a confirmed fact disappears or changes without an explicit invalidation reason.
- `assertFinalResponseSourceV3` rejects every final V3 response whose `source` is not `CONVERSATION_BRAIN_V3`.
- unfamiliar natural-language entity surfaces are retained as `TENTATIVE`; they are never converted to “missing” merely because a source-code synonym list lacks the phrase.
- semantic candidate values are checked against the current scoped activity contract and `entity_definitions`; the semantic model does not gain execution authority.

Phase 1 acceptance remains the approved real-WhatsApp case plus the language corpus. No Phase 2 work may start until the owner reviews the real shadow snapshot and fact-retention result.
