# DABBIR Semantic Gateway Reasoning Budget — 2026-09-10

## Live evidence

Production full-customer-journey run `34434752594` on SHA `bff9d58da4ee89dfb7f9dce9b6b673e1d05423b0` proved the previous single-delivery-mode authority repair: the real-model cognitive goal continuity case now moved from `vehicle` to `location` correctly.

The same run exposed a separate required failure in `15f_cognitive_context_references`:

- direct Google Gemini: HTTP 429;
- Groq: HTTP 429;
- Cloudflare Workers AI: timeout after about 5 seconds;
- Vercel AI Gateway / `google/gemini-3.7-flash`: HTTP 200 after about 11.2 seconds;
- gateway usage: 1,593 completion tokens, of which 1,536 were reasoning tokens;
- configured semantic `max_tokens`: 1,600;
- the semantic contract did not complete, a second gateway model could not start inside the shared four-request budget, and the interpreter returned `AI_PLANNER_UNAVAILABLE` / safe `RETRY` with no execution.

The evidence therefore does **not** show a valid semantic result being discarded. It shows a transport-success response exhausting almost the entire output allowance on reasoning and leaving insufficient room for the required structured JSON.

## Root cause

For OpenAI-compatible semantic calls DABBIR used one fixed `max_tokens: 1600`. The configured production gateway model is Gemini 3.7 Flash. Vercel AI Gateway counts reasoning tokens toward the output limit, and the request did not bound Gemini reasoning effort. On the failing call, reasoning consumed 96.4% of the output allowance.

This is a provider-budget configuration defect in the semantic adapter, not an authorization defect and not a reason to weaken the semantic schema.

## Repair

Only for semantic `json_object` requests sent through Vercel AI Gateway to `google/gemini-*`:

- set provider-agnostic Chat Completions reasoning to `{effort:'low'}`;
- raise semantic output headroom from 1,600 to 2,400 tokens.

Direct providers, non-Gemini gateway models, ordinary customer-facing AI replies, mutation authority, tenant isolation, activity/service contracts, slot verification and RLS are unchanged.

## Safety behavior

A malformed, truncated, timed-out or otherwise invalid semantic response is still rejected. The interpreter still returns the existing recoverable failure and no execution authority is created. This change only gives the configured reasoning model enough bounded room to return the already-required JSON contract.

## Regression

`test/dabbir-semantic-gateway-reasoning-budget-regression.test.mjs` reproduces the live provider order (three degraded direct providers followed by Gemini through the gateway) and requires the final request to carry low reasoning plus 2,400-token structured-output headroom while staying within the existing four-request cap. It also locks the ordinary non-semantic reply budget at 320 tokens.

Do not accept this as Production proof until required CI is green and the exact Production full-customer journey passes both cognitive goal continuity and cognitive context-reference gates.
