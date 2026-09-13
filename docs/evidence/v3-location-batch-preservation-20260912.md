# V3 location batch preservation — bounded first patch

## Scope

Baseline: `7645f9df82fc8c365f42451b949f387ec24db3d5`, read back from GitHub main and Production `/api/release-evidence` before editing. Only `api/_dabbir-conversation-v3-interpreter.js` changes runtime behavior. No candidate identity/version, lifecycle/audit schema, state repair, greeting/episode logic, prompt/output schema, provider order/budget, SQL, migration, booking writer, Meta transport, security or CI gate changes. No merge or Production rollout is authorized by this evidence.

Open PR #748 at `b13658f8b2cb8d4cfcd9a6395bee033df84e8a20` handles returning greetings and historical state. It is not part of this patch. Its interpreter change touches previous-state summary, not this batch seam; integration must still be checked before either merge.

## Root cause and bounded repair

The interpreter associated location evidence only with the final batch message. A final location could return from fastPath and discard earlier correction text; a location before the text could be lost instead. The original display text also entered the semantic input even though it was generated from a receipt rather than customer vehicle language.

The patch collects receipt-backed location evidence by message ID across the batch, retaining the existing business/conversation receipt scope matching. If there is other content in the batch, no terminal fast path may consume it: the existing metered model path interprets that content once. Receipt-backed display text is excluded from the current semantic message and its evidence validator; ordinary location-looking customer text is NOT promoted or removed. The separate verified location fact is retained for the unchanged reducer and authority.

A standalone location retains zero model calls and does not confirm a tentative vehicle or grant a booking slot. Repeated receipts for identical coordinates collapse to one location in batch order; conflicting points are rejected with the existing contract-error class rather than inventing a multiple-location resolver. This is fail-closed, not support for multi-location orders. A mixed text payload exceeding the existing 2000-character input budget rejects before the model rather than clipping a later correction. Contract/provider errors never turn into success for only the location part. No error threshold or retry policy was changed.

## Frozen reproduction

The test-only RED commit is `dd2a43a1bf78b608cf2f003439ed19d60205ff68`.

- Original interpreter Git blob: `8277dd6f1c7168c2d51717438a1bebb07d75823f`.
- Frozen test Git blob: `f9482459b72caeeefcefac2729ccd3bd472b6957`.
- Frozen test SHA-256: `2c33bd3e4d83e5e00f2c10bcf46866a66fb1012798ba6e3b0038a96be0a4612a`.
- Before: 20 tests, 6 pass / 14 fail, zero skips.
- After: the same 20 tests, 20 pass / 0 fail, zero skips.
- `node --check` and `git diff --check`: PASS locally.

Cases cover Arabic/English, both message orders, correction split around a location, price side questions, receipt scope mismatch, location-looking text without a receipt, model failure, malformed JSON, mismatched evidence, oversized mixed text, distinct and repeated locations, unchanged standalone location, and reducer/planner plus modeled JSON reload. The candidate test SHA-256 was rechecked after implementation.

In the full repository, run:

```sh
node --test test/dabbir-v3-location-batch-preservation.test.mjs
npm test
```

Local execution used Node v22.16.0 against byte-matched source. A local-only ESM import seam replaced the default live-provider module with a function that throws if used; model cases inject explicit JSON through the public generate parameter. The PR test itself uses ordinary repository imports and needs no custom loader or changes to test scripts. Repository CI uses its own pinned environment and must run on the final head.

## What this does NOT close

The pre-existing independent eight-case root-cause acceptance suite was rerun: 2 pass / 6 fail after this patch, versus 1 pass / 7 fail before it. Only the mixed correction/location condition turns green. Historical-state quarantine, greeting behavior, operational idle age, invalidation/denial lifecycle, misleading missing-field prose and duration rendering remain outside this patch. Their assertions were not changed.

These local tests do not prove a live model's Arabic accuracy, PostgreSQL persistence, actual worker concurrency, replay semantics, or real WhatsApp receipt issuance/delivery. Fixtures use synthetic IDs and coordinates; no customer data was modified or sent. Candidate identity and event-idempotency integration remain a separate subsequent patch. Full CI and exact-head preview are required before any readiness decision; real-phone evidence and Production verification are still separate gates.

Rollback of this bounded runtime change requires only reverting the PR; there is no data migration.
