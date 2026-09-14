# DABBIR — Agent Runtime Hardening P0-A

Status: BLOCKED_EXTERNAL_AND_REMEDIATION
Observed at: 2026-09-14

This evidence file contains only non-secret metadata, exact-SHA findings, test evidence, and blockers. No credential values are recorded here.

## Freeze current truth

- Frozen pilot main for this P0-A audit: `00ffb68ab0dee7b184c97aa8c38c410720c23ab6`.
- Current control-plane main rechecked during the audit: `26c64fc4c90375912bfef7186e009594d98e73fd`. Final P0-A verdict must refresh both repositories again because the control-plane moved after the audit began.
- `pilot` uses AI SDK `7.0.62` and `@ai-sdk/openai-compatible` `3.0.44`. The autonomous operator uses `ToolLoopAgent` with `MAX_STEPS=6`; `WorkflowAgent` is explicitly not shipped in the current dependency graph.
- `barman-browser-worker` is a separate runtime lane: Node 24, `puppeteer-core` `25.8.0`, `@sparticuz/chromium` `149.0.0`, and AI SDK `6.0.56`. This major-version difference is recorded as intentional current truth; browser-lane evidence must not be mixed with the DABBIR AI SDK 7 lane, and any future shared tool/schema contract must test cross-major compatibility explicitly.
- P0-B and later phases remain gated on P0-A PASS.

## Control-plane protection evidence

`CONTROL_PLANE_REQUIRED_CHECKS_ENFORCED = true` based on direct GitHub policy evidence, not the legacy branch-protection summary alone.

- Active repository ruleset: `BARMAN Main Protection` (`id=21149511`), target `branch`, condition `~DEFAULT_BRANCH`, enforcement `active`.
- Ruleset requires pull requests plus strict required status checks `BM Control Plane CI` and `Executive Integrity`.
- `bypass_actors` is empty and `current_user_can_bypass` is `never` in the observed ruleset response.
- The legacy branch-protection endpoint reports its classic protection surface as disabled/off; that endpoint is therefore not sufficient by itself to determine effective protection when repository Rulesets are active.
- Independent behavioral corroboration: the most recent merged control-plane PR #592 had both required workflows complete successfully on its exact head `6debb1f13ed34d4b63e061e47121cc2e4c51352b` before merge.

Security-verdict rule for this audit: use the authoritative policy surface for the control being evaluated and corroborate material claims with execution/history evidence where available; do not infer absence of protection from one legacy endpoint when a newer enforcement surface exists.

## Current-tree secret finding classification

Latest classified PR #820 scan reported 10 current findings and 59 historical findings.

| Location | Classification | Evidence-based disposition |
| --- | --- | --- |
| `api/auth/owner-otp.js:34` | FALSE_POSITIVE | Credential scanner matched the static response header value `actor-bound-otp-v12`; this is protocol/version metadata, not authentication material. |
| `docs/architecture/legacy-removal-proof.json:35,63,87` | FALSE_POSITIVE | SHA-256 integrity hashes used to prove retained declarations; not credentials. |
| `test/calendar-security-bootstrap.test.mjs:15` | TEST_FIXTURE | Test-only credential-shaped fixture. |
| `test/dabbir-ai-budget-observability.test.mjs:6` | TEST_FIXTURE | Test-only Langfuse-shaped fixture. |
| `test/dabbir-ai-observability.test.mjs:5` | TEST_FIXTURE | Test-only Langfuse-shaped fixture. |
| `test/dabbir-whatsapp-booking-flows.test.mjs:37,45,112` | TEST_FIXTURE | Deterministic fixed WhatsApp Flow tokens inside unit tests; not production credentials. |

No blanket scanner allowlist is authorized by these classifications. Any future suppression must be exact and narrow enough that a new credential-shaped literal elsewhere still fails closed.

## Historical findings

Historical findings are not automatically safe because they are absent from the current tree. The classified disposition artifact now records the reviewed historical groups and currently reports no unresolved real secret. That classification does not substitute for provider-side rotation/revocation evidence if a future finding cannot be proven public, synthetic, test-only, or retired.

## Vercel environment metadata

The value-free Vercel metadata audit is implemented and fail-closed. The configured GitHub Actions Vercel credential currently returns HTTP 403 for all four audited projects:

- `dabbir`
- `barman-browser-worker`
- `barman-live-ceo`
- `ai-council-p0`

The connected Vercel account can enumerate the team/projects through the available management connection, but the audit credential itself has not proven least-privilege environment-metadata read access. No environment-variable values were emitted. This is an authorization blocker, not evidence that the projects have no environment variables.

## Gate

`P0_A_PASS = false`

Remaining mandatory closure:

1. restore least-privilege Vercel environment-metadata read authorization and obtain a value-free PASS;
2. complete the OIDC claim audit for issuer, audience, repository, ref, workflow_ref, event_name, expiry/nbf, and environment binding, including negative tests for unintended source claims;
3. rotate/revoke any real or unprovable long-lived credential if later evidence identifies one;
4. rerun the secret/history scanner with only reviewed exact suppressions for proven false positives/test fixtures and preserve the machine-readable disposition artifact;
5. refresh exact `pilot` and `barman-control-plane` main SHAs immediately before the final verdict.

No P0-B work is authorized before these conditions are satisfied.
