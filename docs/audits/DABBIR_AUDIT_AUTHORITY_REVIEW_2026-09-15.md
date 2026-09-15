# DABBIR Audit Authority Review — 2026-09-15

## Classification

Historical audit-governance snapshot. This file records the evidence and decision of this review only. It is **not** current Production authority.

## Repository baseline at review start

- Repository: `barman-systems/pilot`
- `main`: `afcbc6bd25acf5e62895e6015440990a11f5fc9c`
- Main commit: `DABBIR — Reconcile verified Supabase advisor baseline drift (#873)`

## Question reviewed

Should DABBIR keep an audit as a fixed artifact, and if so, should that artifact become the authoritative current system state?

## Verified evidence

1. The repository already has a canonical `docs/audits/` evidence area. Creating a second `/audit/` hierarchy would duplicate an existing authority surface.
2. `test/dabbir-live-release-authority.test.mjs` declares the live release endpoint as runtime authority and explicitly prevents BAR-12 from trusting historical deployment snapshot fields such as `verified_source_commit` and `verified_deployment_id`.
3. `api/release-evidence.js` derives current deployment identity from the Vercel runtime environment and fails closed when commit or source identity evidence is missing or mismatched.
4. `docs/DABBIR_STABILITY_CONTRACT.md` requires the exact Production artifact to pass the required customer journey; CI on another SHA is not Production evidence.
5. `config/supabase-advisor-baseline.json` is a reviewed comparison baseline, captured on `2026-09-15T12:07:20Z`. It keeps `fail_on_new_warning_or_error` and `fail_on_warning_or_error_count_increase` enabled.
6. `scripts/dabbir-supabase-advisors-gate.mjs` reads current Supabase advisor state live and compares it to the reviewed baseline. The baseline by itself is not treated as proof of current health.
7. `docs/root-cause-registry.md` does not allow a recurring/P0/P1 defect to be closed until its invariant exists in CI and the exact Production artifact has passed the journey that exposed it.
8. The repository rulesets endpoint returned an empty ruleset list during this review. Branch-protection details were not readable through the active integration (`403 Resource not accessible by integration`). Therefore this review does **not** claim that GitHub history is cryptographically or administratively immutable.

## Decision

Adopt three distinct authorities:

- **Live Truth** — current operational authority, read live from the relevant source.
- **Audit Snapshot** — historical evidence of what was proven at a specific time/scope/artifact.
- **Baseline** — reviewed comparison input that may evolve through repository history.

Invariant:

`LIVE_TRUTH != AUDIT_SNAPSHOT != BASELINE`

A historical audit must never be used as current Production, deployment, database, or readiness truth without a fresh live read.

## Persistence rule

Preserve a historical snapshot when an audit materially changes or authorizes any of the following:

- Production state or deployment decision;
- security decision/control;
- reviewed baseline;
- merge or deploy decision;
- P0/P1 or recurring failure closure/control state.

Routine successful checks that change nothing may remain in CI/log evidence and do not require a new repository artifact.

## Architecture decision

Do **not** add a new audit service, database, agent, orchestration layer, or parallel `/audit/` tree. Reuse the existing `docs/audits/`, live release authority, CI gates, Supabase advisor gate, and root-cause registry.

## Resulting permanent control

The canonical policy is `docs/audits/AUDIT_AUTHORITY_CONTRACT.md` and regression coverage is `test/dabbir-audit-authority-contract.test.mjs`.

## Explicit limitation

This snapshot is an audit-authority/governance review. It is not presented as a new full-system runtime audit of every DABBIR/BARMAN component on 2026-09-15.
