# DABBIR — GitHub Native Agents Adoption Preflight

Date: 2026-09-14
Baseline main SHA: `caacfb18caa9955edf998c1799bf02d48948ec91`

## Decision

Adopt GitHub native agents only as a bounded engineering execution/review layer. They are not a trust root, merge authority, release authority, or production operator.

## P0 found before adoption

At the baseline SHA, GitHub reported `main` as protected but the visible required status context was only `test`. The repository already had a trusted-base `BARMAN Independent Pre-Merge Gate`, but the native branch-protection bootstrap did not require that status.

The bootstrap also treated a missing `DABBIR_GITHUB_ADMIN_TOKEN` as a skipped configuration instead of a failed protection run. That allowed the desired protection state to remain unapplied without a hard failure.

A second trust-boundary gap was found during implementation: the trusted-base pre-merge gate protected `.github/**`, the pre-merge gate itself, the BARMAN tool-agent surfaces, required-gate logic, and the security gate, but it did not classify the post-merge independent verifier worker, verifier API, or Production-SHA waiter as protected trust-root code.

## Root fix in this change

The native protection bootstrap now:

- fails closed when `DABBIR_GITHUB_ADMIN_TOKEN` is absent;
- requires strict status checks against current `main`;
- requires both `test` and `BARMAN Independent Pre-Merge Gate`;
- keeps admin enforcement, linear history, no force pushes, no branch deletion, and conversation resolution;
- deliberately keeps human/code-owner approval counts at zero so the removed owner-approval gate is not reintroduced;
- verifies the applied state after the protection API call.

The existing trusted-base pre-merge gate remains the hard policy boundary for protected repository trust-root changes. It now protects:

- all `.github/**` definitions, including agent profiles and workflows;
- `scripts/barman-independent-premerge-gate.mjs`;
- `scripts/barman-independent-verifier.mjs`;
- `api/barman-independent-verifier.js`;
- `scripts/wait-dabbir-production-sha.mjs`;
- `scripts/barman-tool-agent.mjs`;
- `api/barman-tool-agent-broker.js`;
- `scripts/dabbir-required-pr-gates.mjs`;
- `scripts/dabbir-security-gate.mjs`.

A PR author outside `TRUST_ROOT_AUTHORITY_ACTORS` is rejected when the PR touches any of those paths. This backs the agent prompt policy with deterministic trusted-base enforcement; an agent cannot gain trust-root authority simply by ignoring its instructions.

## Agent authority

### `dabbir-engineering`

Allowed:

- read/search repository context;
- edit bounded implementation code, tests, migrations, and documentation;
- execute local syntax/tests/build diagnostics;
- produce reviewable branch/PR work.

Denied by policy and, for trust-root paths, by deterministic pre-merge enforcement:

- `.github/**` edits, including agent/workflow/CODEOWNERS changes;
- edits to independent verifier, independent pre-merge gate, security-gate, required-gate, or BARMAN tool-agent authority;
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

`test/dabbir-github-native-agents-governance.test.mjs` and `test/barman-independent-premerge-gate.test.mjs` pin the following invariants:

- independent pre-merge status is in native protection configuration;
- missing admin credential fails the bootstrap;
- no human owner-approval gate is reintroduced;
- engineering agent has bounded tools and explicit trust-root exclusions;
- review agent is read-only;
- no per-agent MCP configuration exists;
- agent/protection files remain explicit trust-root ownership paths;
- the trusted-base gate protects the independent verifier worker/API/waiter as well as the existing pre-merge/security/tool-agent trust root;
- an ordinary agent identity is not treated as a trusted trust-root actor.

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
