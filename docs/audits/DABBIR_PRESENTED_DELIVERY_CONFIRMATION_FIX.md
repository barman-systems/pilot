# Real phone delivery confirmation regression

Production baseline: `4ef4fb47ac7474757ce8b5972a14b4293501a7b6`.

The owner supplied a phone photograph showing a delivered greeting, a car wash request, the operator's question `وين تبا الخدمة: عندك؟`, and the customer's unanswered `هي`. The signed, non-simulated customer message was persisted at **2026-09-10 08:41:47.173360 UTC**. Its batch remained `RETRY` with `COGNITIVE_QUALITY_BLOCKED` after three attempts. This is separate from the earlier greeting handoff failure; the new greeting itself was processed and shown on the phone.

The saved delivery-mode inference was `AT_BUSINESS`, while the authoritative activity contract offered only `MOBILE`. The affirmative reducer promoted the hidden inference to `CUSTOMER_CONFIRMED`, even though the displayed question offered the other mode. Operational requirements correctly rejected the unsupported mode, but described it only as missing, without marking it invalid. The unchanged quality gate then refused to ask for that supposedly confirmed fact. No understanding commit, outbound reservation, or business mutation should follow a blocked decision.

The correction binds a bare affirmative to the existing, provider-accepted pending question. The current service and contract version, cognitive revision, question field and exact generated question must agree. A single offered delivery mode can then be confirmed, with obsolete slot authority invalidated. Multiple choices, an undelivered question, a changed contract, a different question or an intervening greeting confer no confirmation authority. An unsupported mode is explicitly invalid regardless of fact provenance, so it can be clarified through the existing quality rules.

No quality gate, handoff threshold, tenant check, execution check, provider, model, schema or database record is weakened or reset. The real database workflow adds this candidate branch to its existing allowlist; its transaction and isolation assertions are unchanged.

Ten permanent replay and adversarial tests failed on the baseline (0/10). After the correction, the targeted dialogue/activity suite passes 80/80, including all ten new tests. The release evidence report records the full suite, CI, deployment and real-phone follow-up separately; a local replay is not a claim of phone delivery.
