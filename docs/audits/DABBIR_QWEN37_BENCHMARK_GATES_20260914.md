# DABBIR Qwen3.7 Intelligence Benchmark — release gates

Date: 2026-09-14

This document is evidence scope for Issue #792. It does not authorize a Production model-routing change.

## Objective

Evaluate `alibaba/qwen3.7-flash` as a lower-cost DABBIR cognitive candidate without allowing provider fallback, model substitution, schema weakening, customer delivery, or business mutation to masquerade as intelligence.

## Non-negotiable isolation

1. Candidate execution is shadow/synthetic only before canary.
2. The exact successful model must equal `alibaba/qwen3.7-flash`.
3. The transport provider must equal `vercel-ai-gateway` for this candidate.
4. Any gateway fallback model is a failed candidate run, not a successful Qwen run.
5. Direct Gemini, Groq and Cloudflare credentials are excluded from the candidate evaluation environment.
6. The candidate has no database/customer mutation tool. The existing synthetic cognitive probe must keep `external_side_effects=false` and `no_execution=true`.
7. Application semantic validation, tenant boundaries, booking authority, state provenance and delivery evidence are unchanged.

## Credential and routing contract

- Prefer existing Vercel AI Gateway authentication. Do not add an Alibaba production secret merely to benchmark a model already reachable through the existing gateway.
- If an AI Gateway API key is used for a non-Vercel test runner, scope it to the benchmark environment only.
- Gateway routing must be constrained to Alibaba for the Qwen candidate, and the returned model ID must still be verified exactly.
- No free-tier status is treated as a reliability or pricing guarantee.

## Benchmark gates

Run the current fixed cognitive scenarios:

- `critical`
- `correction_side_question`
- `multiple_requests`
- `service_details`
- `context_references`
- existing conversational benchmark / regression gates

Record per scenario:

- semantic contract validity
- goal and intent continuity
- reference resolution
- side-question and correction handling
- independent multi-goal handling
- forbidden mutation count
- exact provider and model
- request attempts and failures
- p50/p95 latency where the sample size permits
- input/output/reasoning tokens
- estimated cost per 1,000 bookings using the measured DABBIR Production usage distribution

## Failure policy

The candidate fails closed on any of the following:

- wrong provider or wrong model
- fallback model used
- invalid structured contract
- timeout / 429 exhaustion
- safety or authority regression
- fabricated business fact
- ungrounded booking mutation
- regression in a required benchmark gate

No prompt/schema relaxation is allowed solely to make Qwen pass.

## Promotion sequence

`OFFLINE/SHADOW -> FIXED REAL-MODEL PROBE -> FULL BENCHMARK -> PREVIEW/CANARY -> PRODUCTION DEFAULT`

Each transition requires evidence from the preceding stage. Production default remains unchanged until all gates are green.

## Rollback

A future canary must preserve the current production route as an immediately selectable fallback configuration. Promotion must be a configuration-level model change, not a destructive replacement of the existing provider path.
