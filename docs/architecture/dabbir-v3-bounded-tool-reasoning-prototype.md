# DABBIR V3 Bounded Tool-Reasoning Prototype

Status: benchmark-only prototype. No Production mutation authority.

## Objective
Test whether V3 can move from required-fields conversation routing to bounded reason → observe → reason behavior without V4, a new agent, or a new orchestrator.

## Authority split
- AI owns interpretation, next-tool choice, option comparison, clarification necessity, and action proposal.
- Tools expose scoped ground truth only.
- Existing Brain Contract / semantic execution owns mutation authorization, revalidation, idempotency, verification, and receipts.

## Prototype tools
1. `inspect_context` — relevant business/customer facts already available to V3.
2. `find_options` — grounded candidates, conflicts, and alternatives. It does not execute and does not hide language-specific ranking rules.

Execution is intentionally not exposed as a reasoning tool in this prototype.

## Bounds
- max 3 reasoning iterations per customer turn.
- max 4 grounding tool calls per customer turn.
- no hard episode call cap; episode usage is measured.
- budget exhaustion exits safely; it never grants execution authority.

## Clarification rule
A clarification is justified when customer authority is still required after useful grounded progress is exhausted. Missing fields alone are not a conversational reason to ask.

## Anti-chatbot rules
- no phrase-specific branches for benchmark cases.
- no new enum for each human expression.
- language interpretation stays with the model.
- deterministic code may validate stored facts and execution authority, but must not infer free-form customer meaning.

## Benchmark
Compare Current V3 vs prototype on at least 20 frozen cases including temporal preference, nearest availability, references (`same car`, `same location`), service fallback, worker preference, side questions, corrections, disappearing slot, conflicting constraints, impossible request, stale memory, wrong reference, and tool/provider failure.

Required gates before any shadow traffic:
- wrong mutation = 0
- unsupported factual assumption = 0
- customer correction rate does not increase
- unnecessary clarifications decrease >= 40%
- task completion improves >= 10 percentage points when the frozen benchmark has a measurable completion baseline
- p95 latency target <= baseline + 1.5s

Kill if phrase-specific logic/enums are added to satisfy benchmark cases, execution authority leaks into the loop, corrections increase as clarification falls, or two tool-interface refinements fail to improve completion.
