# DABBIR Operational Intelligence Grounding V1

## Scope

This change addresses two production-observed understanding failures without adding a new agent, provider, or authority layer.

## Production evidence

A 14-day read-only baseline found a repeated pattern of `MISSING_OR_AMBIGUOUS_FACT` decisions and unnecessary clarification. Two concrete root cases were selected because they remain meaningful at the semantic boundary:

1. A customer selected the configured `Vip` service using Arabic spoken-letter spelling (`في اي بي`), but the catalog matcher did not ground the service.
2. A customer said `اليوم الساعة 5` / `اليوم الساعة 6` after the AM interpretation had already passed locally; the semantic reducer still requested AM/PM clarification instead of safely selecting the only future same-day interpretation.

Historical greeting-loop and repeat vehicle/location failures are not part of this change because later merged fixes already cover those classes.

## Contract

- Arabic phonetic acronym matching is deterministic and catalog-grounded.
- It annotates a service only when exactly one scoped catalog service matches.
- Ambiguous acronym matches fail closed and keep clarification.
- Same-day 1–12 clock values infer PM only when the AM candidate is already in the past and the PM candidate is still in the future in the verified business timezone.
- Tomorrow and cases where both AM/PM remain possible still require clarification.
- Original persisted customer message is unchanged; an in-memory semantic rewrite is used only after deterministic grounding.
- No mutation authority, tenant boundary, provider policy, cost policy, or booking execution rule changes.

## Acceptance

Regression coverage proves:

- `في اي بي` uniquely grounds `VIP`.
- a catalog collision such as `VIP` + `VIB` does not guess.
- same-day safe PM inference succeeds.
- tomorrow remains ambiguous.
- early same-day ambiguity remains ambiguous.
