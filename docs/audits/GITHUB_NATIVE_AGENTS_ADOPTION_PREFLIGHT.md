# DABBIR — GitHub Native Agents Adoption Preflight

Date: 2026-09-14
Baseline main SHA: `caacfb18caa9955edf998c1799bf02d48948ec91`

## Decision

Adopt GitHub native agents only as a bounded engineering execution/review layer. They are not a trust root, merge authority, release authority, or production operator.

## P0 found before adoption

At the baseline SHA, GitHub reported `main` as protected but the visible required status context was only `test`. The repository already had a trusted-base `BARMAN Independent Pre-Merge Gate`, but the native branch-protection bootstrap did not require that status.

The bootstrap also treated a missing `DABBIR_GITHUB_ADMIN_TOKEN` as a skipped configuration instead of a failed protection run. That allowed the desired protection state to remain unapplied without a hard failure.

## Root fix in this change

The native protection bootstrap now:

- fails closed when `DABBIR_GITHUB_ADMIN_TOKEN` is absent;
- requires strict status checks against current `main`;
- requires both `test` and `BARMAN Independent Pre-Merge Gate`;
- keeps admin enforcement, linear history, no force pushes, no branch deletion, and conversation resolution;
- deliberately keeps human/code-owner approval counts at zero so the removed owner-approval gate is not reintroduced;
- verifies the applied state after the protection API call.

## Agent authority

### `dabbir-engineering`

Allowed:

- read/search repository context;
- edit bounded implementation code, tests, migrations, and documentation;
- execute local syntax/tests/build diagnostics;
- produce reviewable branch/PR work.

Denied by policy:

- trust-root workflow/agent/CODEOWNERS edits;
- edits to independent verifier, independent pre-merge gate, or security-gate authority;
- production credentials or production mutations;
- deployments;
- MCP servers/tools;
- network-write integrations;
- weakening tests or assertions;
- self-merge or production-readiness claims.

### `dabbir-review`

Read/search only. It may identify findings and evidence gaps, but it cannot edit, run shell commands, approve, merge, deploy, or assert `PRODUCTION_READY`.

A clean model review is expressed only as `NO_MODEL_BLOCKER_FOUND`. Deterministic gates remain authoritative.

## Deliberately not enabled

This preflight does **not**:

- enable the existing `BARMAN Persistent Tool Agent`;
- delete `barman-tool-agent.mjs` or other custom orchestration;
- configure MCP;
- add production secrets to an agent runtime;
- add autonomous merge or deployment;
- make Agentic Workflows a release authority;
- create additional permanent specialist agents.

## Activation proof required after merge

The change is not considered fully activated until GitHub's live `main` protection reports both required contexts:

1. `test`
2. `BARMAN Independent Pre-Merge Gate`

and the bootstrap run completes successfully with its post-apply verification.

If the bootstrap fails because the admin credential is unavailable, the result is intentionally fail-closed and must not be reported as activated.

## Regression contract

`test/dabbir-github-native-agents-governance.test.mjs` pins the following invariants:

- independent pre-merge status is in native protection configuration;
- missing admin credential fails the bootstrap;
- no human owner-approval gate is reintroduced;
- engineering agent has bounded tools and explicit trust-root exclusions;
- review agent is read-only;
- no per-agent MCP configuration exists;
- agent/protection files remain explicit trust-root ownership paths.

## Next evaluation phase

After activation, evaluate the native engineering agent on real bounded DABBIR tasks against the existing BARMAN implementation path. Measure at minimum:

- first-pass patch correctness;
- CI pass rate without test weakening;
- regression rate;
- changed-file scope discipline;
- security findings;
- human/model review findings missed by the other path;
- time and AI cost per accepted task.

Only after repeated evidence should duplicated BARMAN patch-discovery/orchestration code be removed. Deterministic CI, security, exact-SHA, independent pre-merge, production evidence, and customer-journey gates are out of scope for removal.
