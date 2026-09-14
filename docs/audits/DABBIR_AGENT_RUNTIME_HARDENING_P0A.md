# DABBIR — Agent Runtime Hardening P0-A

Status: BLOCKED_EXTERNAL_AND_REMEDIATION
Observed at: 2026-09-14

This evidence file contains only non-secret metadata, exact-SHA findings, test evidence, and blockers. No credential values are recorded here.

## Freeze current truth

- Frozen pilot main for this P0-A audit: `00ffb68ab0dee7b184c97aa8c38c410720c23ab6`.
- Control-plane protection is enforced by active repository ruleset `BARMAN Main Protection` with required PR/status-check rules; the classic branch-protection endpoint alone is not authoritative.
- P0-B and later phases remain gated on P0-A PASS.

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

Historical findings are not automatically safe because they are absent from the current tree. The scan found historical credential-shaped material in runtime, workflow, script, test, and retired paths. Each historical runtime/workflow finding must be proven synthetic/public/retired or have rotation/revocation evidence before P0-A PASS.

## Vercel environment metadata

The value-free Vercel metadata audit is implemented and fail-closed. The configured Vercel credential currently returns HTTP 403 for all four audited projects:

- `dabbir`
- `barman-browser-worker`
- `barman-live-ceo`
- `ai-council-p0`

No environment-variable values were emitted. This is an authorization blocker, not evidence that the projects have no environment variables.

## Gate

`P0_A_PASS = false`

Remaining mandatory closure:

1. disposition historical credential-shaped runtime/workflow findings without exposing values;
2. rotate/revoke any real or unprovable long-lived credential;
3. restore least-privilege Vercel metadata-read authorization and obtain a value-free PASS;
4. rerun the scanner with only reviewed exact suppressions for proven false positives/test fixtures;
5. refresh exact main SHAs immediately before the final verdict.

No P0-B work is authorized before these conditions are satisfied.
