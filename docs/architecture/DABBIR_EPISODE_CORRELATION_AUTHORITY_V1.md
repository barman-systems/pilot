# DABBIR Episode Correlation Authority V1

## Decision

DABBIR already owns episode boundaries in Conversation Brain V3. This change does **not** add another detector, agent, model, or orchestrator.

The canonical runtime identifier is:

```text
episode_id = <conversation_id>:<episode_started_at>
```

For historical V3 rows that predate durable propagation, the backfill uses a separate epoch key:

```text
legacy-v3:<NEW_EPISODE understanding_event_id>
```

Native and historical keys are intentionally not string-matched or rewritten into one format.

## Authority chain

```text
V3 runtime episode_id
  -> UNDERSTOOD evidence
  -> planner/operator evidence
  -> action ledger
  -> booking funnel / database commit
  -> derived episode outcome
```

The database binds the identifier from canonical semantic state or from the durable source row. RPC callers do not receive authority to invent a different episode identifier.

Late evidence must never be attached from mutable "current conversation state" when an immutable source row exists. Appointment/payment funnel evidence follows the originating action ledger row.

## Handoff correlation

Handoff safety is more important than measurement completeness.

A handoff is attached to an episode only when the database can prove all of the following at insertion time:

- canonical state has a V3 `episode_id`;
- canonical state identifies `semantic_batch_id`;
- that exact batch has a durable V3 `UNDERSTOOD` event carrying the same episode id;
- that batch is still `PROCESSING`.

This means a provider/interpreter failure **before** semantic commit cannot be misattributed to the previous episode. If causal proof is absent, the handoff proceeds normally with `episode_id = NULL`.

Historical V3 handoffs predate this causal link. We deliberately do not infer their episode using nearest timestamps. The projection therefore labels historical correlation as `HISTORICAL_HANDOFF_PARTIAL`; historical handoff rates must not be compared directly with post-cutover `CAUSAL_NATIVE` rates.

## Evidence ranking

```text
VERIFIED_EXTERNAL_RECEIPT
  > DATABASE_COMMIT
  > EXECUTION_EVENT
  > HANDOFF_EVENT
  > PLANNER_DECISION
  > CONVERSATION_LABEL
```

`dabbir_ai_booking_episode_outcomes_v1` is a read-only projection. No writer may overwrite an episode's final truth label.

## Completion source

Outcome and completion source are separate dimensions:

- `completed_by = AI` only when a durable AI action commit exists for the episode.
- `completed_by = HUMAN` only when durable evidence explicitly classifies the result as human-confirmed.
- otherwise `completed_by = UNKNOWN`.

A receipt after a handoff must never be counted automatically as an AI-completed success.

## Metrics

Do not publish one denominator alone.

Report together:

1. `AI autonomous completion / all initiated booking episodes`.
2. `AI autonomous completion / resolved booking episodes`.
3. `UNRESOLVED / all initiated booking episodes`.
4. `HUMAN_HANDOFF` and `INFRA_HANDOFF` separately.
5. correction/cancellation-after-commit rates alongside clarification reduction.

This prevents a future implementation from improving the resolved-only rate by leaving difficult episodes open.

Historical rows marked `HISTORICAL_HANDOFF_PARTIAL` can be used for committed-action and clarification baselines, but not for exact handoff-rate comparison.

## Boundary policy

Episode boundaries remain owned by `classifyEpisodeBoundaryV3`.

- side questions about price or service information do not end an active booking episode merely because their semantic intent is PRICING or SERVICE_DISCOVERY;
- a side question about a different service also stays inside the active goal unless the customer expresses a new request;
- corrections, confirmations, references, and answers to a pending question remain continuations;
- a genuinely explicit new request may start a new episode even if the new request is another booking;
- idle time is evidence, never sufficient by itself.

Production evidence on 2026-09-15 showed four recorded V3 `NEW_EPISODE` boundaries in the measured window and no duplicate `(conversation_id, created_at)` anchors. The one `DISCOVER_SERVICE` new episode followed a greeting and a fresh `ابي غسيل` request; it was not a pricing/service side-question defect. All 28 measured V3 understanding events were deterministically assignable to one of those four durable anchors.

## Correlation review rule

Any new correlation identifier is incomplete unless its PR documents every durable boundary it must cross.

A review must name:

- producer,
- canonical storage,
- decision/event propagation,
- execution ledger propagation,
- committed-result/receipt propagation,
- historical compatibility,
- failure behavior when correlation is absent.

Creating an identifier without propagating it to its terminal evidence is not considered a complete feature.
