# PR #748 follow-up: current evidence participates in social classification

## Pinned scope

- Main and Production readback: `7645f9df82fc8c365f42451b949f387ec24db3d5`.
- PR #748 baseline: `b13658f8b2cb8d4cfcd9a6395bee033df84e8a20`.
- PR #749 independently pinned at `28c429e94953bc783c7693fd558acc892f4ee377`.
- Frozen test-only RED commit: `f1e836f7ff1d8fd4bd7c8beb3308cc8e3ebfdc94`.
- Test SHA256: `45a5a313ab862d7762cb753775992aced8d08d0555a037f2c69528680e1f8c79`.

This amendment changes one runtime file: `api/_dabbir-conversation-v3-understanding.js`. It does not absorb PR #749, merge a branch, alter schema/candidate identity, repair Production state, implement conflicting-location clarification, or change providers, Meta transport, booking writers, authority, security or CI gates.

## Reproduced seam

PR #749 preserves a location receipt and sends remaining text to the interpreter. If that text is a greeting, PR #748 previously classified the whole turn as SOCIAL_ONLY solely from the semantic proposal. The location reached the reducer, but the old location question and operational clock were retained.

The reducer already constructs `explicitTurnEvidence` from accepted current-turn verified/tentative contributions excluding automatically recomputed DATABASE_FACT values. Reuse that collection in the social-only signal. Do not count seeded history, recomputed delivery mode, or historical reconciliation invalidations as a new customer request. Do not rewrite the text role to CONFIRMATION or grant consent.

The check is not location-specific: both currently supported trusted fast-fact types, location and slot, are tested. Existing producer verification remains the trust boundary. This is not a claim that arbitrary fastFacts supplied by an external caller are trusted.

## Local results

Node v22.16.0. The same frozen 25 seed/reducer/planner tests produce:

| Source | Pass | Fail | Skipped |
| --- | ---: | ---: | ---: |
| PR #748 baseline | 12 | 13 | 0 |
| Candidate amendment | 25 | 0 | 0 |

Unchanged earlier review composition tests against the combined PR #748 + #749 source: 7 pass / 2 fail before, 9/9 pass after. That review file contains six acceptance cases and three characterization/counterexample cases; nine green is NOT a verdict that the entire system is safe.

The 20 frozen original PR #749 tests and the 25 new tests run together against the combined candidate: 45/45 pass, zero skips. The interpreter remains real; a local-only loader denies the default live-provider import and tests inject `generate`. No real LLM, RPC, worker concurrency, replay, Meta or phone acceptance is claimed.

Mutation sensitivity, same unchanged 25 tests:
- Revert to text-only classification: 13 failures.
- Count every turnVerified item, including DB recomputation: 10 failures.
- Gate only location evidence: 2 failures (slot).
- Count historical invalidations as current activity: 2 failures.

## Required gates and remaining work

Full repository CI and Preview must run/read back the final PR head. Local results do not authorize merge or Production rollout. Owner review remains required. Full-model and real-phone acceptance remain outstanding.

The distinct-location-receipt case still fails closed in PR #749 and is not customer-complete. A third independent patch must preserve a text correction at its actual confidence while preventing use of ambiguous/old location and dependent offers, persist clarification, and verify safe recovery. Candidate identity and audit lifecycle remain a separate later responsibility.

The existing replay A/B risk is not changed by this amendment. AC-REPLAY-01 and worker/database concurrency must not be reported as verified from these tests.

## Changed paths for this amendment

- `api/_dabbir-conversation-v3-understanding.js`
- `test/dabbir-v3-social-current-evidence.test.mjs`
- `docs/evidence/v3-social-current-evidence-frozen.json`
- `docs/evidence/v3-social-current-evidence-20260912.md`

No existing test or assertion is edited. Reverting this amendment does not revert or silently incorporate PR #749.
