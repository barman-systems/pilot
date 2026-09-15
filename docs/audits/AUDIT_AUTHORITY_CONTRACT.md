# DABBIR Audit Authority Contract

## Purpose

DABBIR separates current operational truth from historical audit evidence and from reviewed comparison baselines. These are three different authorities and must never be collapsed into one another.

## 1. Live Truth — current authority

A current decision about Production, deployment identity, runtime health, database state, merge readiness, launch readiness, or closure of a production defect must be based on live evidence from the relevant authoritative source.

Examples include:

- `https://dabbir.bmalman.com/api/release-evidence` for the currently deployed Vercel source identity;
- live Supabase advisor output when the database gate is required;
- current GitHub checks and the exact candidate SHA;
- the exact Production customer journey required by `docs/DABBIR_STABILITY_CONTRACT.md`.

Historical audit files are never a substitute for current Live Truth.

## 2. Audit Snapshot — historical evidence only

Files under `docs/audits/` may preserve the evidence and conclusion of a completed investigation or decision at a point in time. A snapshot must be read as:

> At time X, for scope Y and exact artifact/database/deployment identity Z, the recorded evidence supported conclusion C.

A historical snapshot must not claim that Production, a deployment, a database, a provider, a branch, or a readiness state is still current unless that state is re-read live.

For material audits, record when available:

- capture time;
- repository and exact SHA;
- deployment identity and environment;
- database project/ref and migration identity when relevant;
- explicit scope and exclusions;
- evidence references;
- findings and severity;
- resulting decision or control change;
- unresolved items.

Do not create a new snapshot for a routine successful check that changes nothing. Preserve a snapshot when an audit materially changes Production, a security decision, a reviewed baseline, a merge/deploy decision, or the closure/control state of a P0/P1 or recurring failure class.

## 3. Baseline — reviewed comparison input

A baseline is intentionally mutable through reviewed change. It is a comparison input, not current truth and not an immutable audit record.

Examples include `config/supabase-advisor-baseline.json`.

A baseline change must preserve the fail-closed comparison contract. Accepting a reviewed existing exception is not permission to weaken the gate, suppress new findings, or treat the baseline as proof that the live system is healthy.

## Non-negotiable invariants

1. `LIVE_TRUTH != AUDIT_SNAPSHOT != BASELINE`.
2. Historical snapshot fields must not become runtime or release authority.
3. Current Production readiness must bind to the exact deployed SHA/artifact and required live journey.
4. A baseline can change only through reviewed repository history with rationale.
5. An audit snapshot may be corrected only by a new superseding record; do not silently rewrite historical conclusions in place.
6. Existing evidence systems remain canonical. This contract does not introduce a parallel audit service, database, agent, or orchestration layer.

## Relationship to existing controls

- `docs/DABBIR_STABILITY_CONTRACT.md` defines the release state machine and exact-Production closure rule.
- `test/dabbir-live-release-authority.test.mjs` prevents historical deployment snapshot fields from replacing the live release evidence endpoint.
- `scripts/dabbir-supabase-advisors-gate.mjs` reads live Supabase advisor state and compares it against a reviewed baseline.
- `docs/root-cause-registry.md` records recurring/P0/P1 failure classes and requires CI plus exact Production evidence before closure.

This document governs how those existing controls are interpreted. It adds no new runtime authority.
