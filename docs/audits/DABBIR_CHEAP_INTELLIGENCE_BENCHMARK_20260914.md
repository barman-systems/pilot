# DABBIR Cheap Intelligence Benchmark — 2026-09-14

Status: IN PROGRESS

## Objective
Evaluate lower-cost models against DABBIR's existing conversational/semantic benchmark before any Production routing change.

## Candidates
- Qwen3.7-Flash
- Ternary Bonsai 27B

## Non-negotiable boundaries
- No Production default-model change in this phase.
- No weakening of semantic contracts, authorization, tenant isolation, booking authority, receipts, or verification gates.
- Candidate providers run only through explicit benchmark/shadow paths.
- Existing baseline and acceptance tests remain unchanged.
- Raw customer content, credentials, and provider secrets must not be written to benchmark artifacts.

## Required comparison
For each candidate versus the current baseline, measure:
- semantic/intent correctness
- goal continuity and reference resolution
- structured-output contract validity
- tool/action selection correctness
- booking completion path correctness
- provider latency and failure rate
- input/output/reasoning tokens where supplied
- estimated model cost using measured token counts

No candidate is eligible for Production routing until it meets or exceeds the current benchmark on correctness and safety.
