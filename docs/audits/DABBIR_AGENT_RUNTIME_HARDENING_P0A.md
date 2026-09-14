# DABBIR — Agent Runtime Hardening P0-A

Status: **BLOCKED_EXTERNAL**  
Observed: 2026-09-14  
Values included: **false**

P0-A is repository/OIDC-audited but cannot become `P0_A_PASS` because value-free Vercel Production/Preview environment-variable metadata is not available through the connected Vercel capability. P0-B and all later phases remain gated.

## Frozen truth

- `barman-systems/pilot` main: `00ffb68ab0dee7b184c97aa8c38c410720c23ab6`.
- `barman-systems/barman-control-plane` current main observed during P0-A: `26c64fc4c90375912bfef7186e009594d98e73fd`; PR #591 was explicitly merged with that commit before its final P0-A scan.
- `pilot` uses AI SDK `7.0.62`; the autonomous operator uses `ToolLoopAgent` with `MAX_STEPS=6`.
- The browser-worker remains a separate Node 24 / Puppeteer / Chromium lane.

## Secret/history audit

The permanent P0-A guard is:

1. full-history checkout with persisted checkout credentials disabled;
2. pinned Gitleaks `v8.24.3` image digest;
3. redacted current-tree + full-history scans;
4. exact reviewed-fingerprint baseline gate;
5. fail closed on any added, removed, or changed fingerprint.

Reviewed pilot baseline:

- current findings: **10**;
- historical findings: **59**;
- unresolved real secret: **none identified**.

Reviewed classes are limited to static protocol metadata, integrity-hash evidence, test fixtures, public/publishable client identifiers, retired public identifiers, secret references without embedded values, and deliberate secret-detection fixtures. No directory-wide or rule-wide ignore is permitted.

The three `legacy-removal-proof.json` findings were independently classified as 64-hex integrity evidence adjacent to retained declaration/hash metadata, not usable credentials.

## OIDC audit

The current BARMAN tool-agent claim predicate validates:

- GitHub issuer;
- expected audience;
- exact repository;
- exact `main` ref;
- exact canonical workflow ref;
- allowed event names;
- expiry;
- not-before time.

P0-A adds negative tests for alternate issuer/repository and invalid expiry/not-before boundaries. Existing tests already cover wrong audience/ref/workflow/event.

Current live-authority state is fail-closed:

- persistent tool-agent workflow is intentionally disabled;
- it does not have `id-token: write`.

Two controls are explicitly **pre-activation requirements**, not claimed as present today:

1. bind an expected GitHub environment claim before enabling the workflow;
2. add durable one-time replay consumption/binding before enabling execution authority.

Because the workflow is disabled and cannot mint an OIDC token, these are not active Production authority paths today.

## Vercel environment metadata blocker

The connected Vercel capability can read teams/projects/deployments/agent runs but does not expose a safe environment-variable metadata listing action in this session.

A temporary GitHub-token metadata probe was attempted during investigation, returned authorization failure, and has been removed from this PR. P0-A will **not** retain or introduce a new workflow that injects a powerful long-lived Vercel token merely to audit credentials.

Therefore P0-A cannot prove, value-free, for Production/Preview environments that every secret-like variable is Sensitive, short-lived/OIDC-derived, or a documented exception.

This is a capability/authorization blocker, not evidence that the environments are clean or unsafe.

## Gate

`P0_A_PASS = false`

Final state: `BLOCKED_EXTERNAL`.

Closure required:

1. obtain a least-privilege, value-free Vercel environment-metadata read path for the relevant projects/environments;
2. classify names/metadata only; never emit values;
3. remediate/rotate any unprovable long-lived secret if discovered;
4. rerun the exact-head P0-A guard and refresh current main SHAs.

Until then: **P0-B is NOT_STARTED and is not authorized to begin.**
