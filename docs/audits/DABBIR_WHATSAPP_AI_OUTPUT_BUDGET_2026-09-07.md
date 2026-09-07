# DABBIR WhatsApp AI output budget fix — 2026-09-07

## Live failure
The WhatsApp end-to-end test reached DABBIR AI, but the planner sometimes returned an empty response and then a truncated JSON fragment such as `{"action":"`.

## Root cause
`api/_ai-core.js` limited every OpenAI-compatible provider request to `max_tokens: 60`. The WhatsApp planner requires a complete minified JSON object containing action, reply, routing and booking fields. Sixty output tokens is insufficient and can also be consumed by provider reasoning, producing no visible content.

## Fix
Raised the bounded output budget to `320` tokens. User-facing responses remain constrained by the existing DABBIR prompt; the larger budget exists to allow internal structured planner JSON to complete safely.

## Regression coverage
`test/dabbir-ai-output-budget.test.mjs` verifies that AI provider requests use `max_tokens: 320` and can return a complete structured WhatsApp planner response.
