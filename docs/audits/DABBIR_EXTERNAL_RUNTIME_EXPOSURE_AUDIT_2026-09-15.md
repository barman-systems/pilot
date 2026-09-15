# DABBIR External & Runtime Exposure Audit — 2026-09-15

## Classification

Historical security snapshot. This file records evidence observed during the review. It is not current runtime authority and it does not replace live checks.

## Scope

Owner explicitly excluded repository visibility changes from this review. The audited scope was:

- Vercel Production and recent Preview deployments/build evidence;
- available Vercel runtime-log surfaces;
- Supabase Production Edge Functions, Vault access paths, security advisors, RPC/function privileges, and sensitive-column RLS/ACL posture;
- GitHub Actions success/failure logs and a recent full-production-journey artifact;
- prevention of future secret persistence in journey/capacity artifacts.

Review-start repository baseline:

- repository: `barman-systems/pilot`
- `main`: `642bc8ff7ea06e72da2562d45ba380d74e48ca56`
- Vercel project: `prj_HCTFdQo8Vc7FvZRdJ37H7KFYwpUq`
- Supabase project: `fphpoysqdsceniwduxjq`

No secret values are recorded in this audit.

## Verified findings

### Vercel

- The READY Production deployment and recent Preview build logs available to the active integration were inspected without observing plaintext provider credentials, private keys, passworded database URLs, QA passwords, or TOTP material.
- Deployment/runtime evidence continues to expose release identity metadata only (commit/deployment/project/repository), not runtime secret values.
- Targeted runtime-log searches against the READY Production deployment did not return `RESEND_API_KEY` or the QA-password prefix.
- Broad historical runtime-log proof is **not available** through the current integration/plan: a 30-day query returned a billing-limit error and a narrower project-wide query timed out. Therefore this review does not claim complete historical Vercel-log absence.
- The connected Vercel interface does not expose a safe environment-variable inventory/read surface, so this review cannot independently enumerate Production/Preview environment-variable metadata.

### Supabase Production

- Live Security Advisor state matched the reviewed baseline during the audit; no new warning/error class was introduced by this review.
- Fourteen security-relevant Edge Functions were inspected. Secret-bearing execution paths use environment variables, Vault-backed service-role RPCs, or encrypted values; inspected function responses/log statements do not intentionally emit the secret values themselves.
- Retired QA/migration functions inspected in this review return `410` and do not execute their former privileged paths.
- Secret-returning/config RPCs discovered during the live database privilege audit are not executable by `anon` or `authenticated`; service-role access remains the intended runtime boundary.
- Vault secret names were inspected without reading/decrypting their values. No Vault table SELECT path was available to `anon` or `authenticated`.
- Sensitive WhatsApp connection material is stored as ciphertext/IV/tag. Authenticated reads are RLS-scoped to an owner/admin who is a member of the same business; service-role retains the operational path.

### GitHub Actions evidence

- Historical repository-secret exposure is governed by the merged P0-A full-history audit (`#851`), whose final disposition was `unresolved=0`, `verified=0`, `unknown=0`.
- A recent successful Production Journey run (`34943525608`) was inspected. Its job logs did not print owner passwords, TOTP secrets, access tokens, refresh tokens, or provider credentials; the TOTP step explicitly records that the secret is omitted from evidence.
- The run artifact `dabbir-ai-full-customer-journey-evidence` had digest `sha256:26b3c3cd6d40b19d4071c8b456ab537084c9b1dc9a0a4e34090eaf7af076edb4` and contained 148 files: 144 PNG files and four JSON reports.
- The artifact was scanned for high-confidence provider-token/private-key/JWT/passworded-Postgres patterns and for sensitive JSON keys including password, TOTP/MFA secret, access/refresh token, Resend key, service-role key, API/secret key, authorization, cookie, and session token. No matching secret-bearing field/value was found.
- Risk-oriented screenshot samples (onboarding/settings) were visually inspected. They contained synthetic QA identity/display data but no password, TOTP, provider token, or secret-entry surface.
- A failed Production Journey path was also inspected. It failed on exact release identity before the customer journey and uploaded no evidence artifact; the visible failure evidence contained release metadata, not credentials.

## Hardening gap: Resend secret boundary

Current Vercel owner-OTP/team-invite code can forward `RESEND_API_KEY` in an HTTPS JSON request to a Supabase Edge Function. The deployed Supabase mailer supports `Deno.env.get('RESEND_API_KEY')` with the request body as a fallback.

This review found **no evidence that the Resend value was logged, persisted, or returned**, so this is not classified as a confirmed credential leak. It is nevertheless unnecessary long-lived-secret egress across a runtime boundary.

Safe removal requires first proving/provisioning `RESEND_API_KEY` in the Supabase Edge Function secret environment. The active Supabase integration exposes Edge Function source/deploy and database/Vault surfaces but no Edge Function secret-management/inventory operation. The fallback must therefore not be removed blindly because doing so could break owner OTP and team invitation mail.

Status: `HARDENING_REQUIRED / NOT_CONFIRMED_EXPOSURE`.

## Permanent control added by this review

`DABBIR AI Full Customer Journey` and both manual capacity artifacts now pass through `scripts/dabbir-evidence-secret-gate.mjs` before upload.

The gate:

- recursively scans artifact inputs, including binary files for high-confidence ASCII credential material;
- rejects provider keys, private keys, JWTs, credentialed PostgreSQL URIs, bearer credentials, QA-password patterns, and OTP enrollment URIs;
- rejects sensitive JSON key persistence even when a value is nominally redacted;
- does not confuse ordinary telemetry keys such as `inputTokens` / `outputTokens` with credentials;
- fails closed on symlinks or explicitly requested missing paths;
- never prints a detected secret value;
- prevents `actions/upload-artifact` from running when the gate fails.

Regression coverage is provided by `test/dabbir-evidence-secret-gate.test.mjs` and the authoritative journey-workflow contract test.

## Decision

Within the evidence surfaces actually accessible during this audit, there is **no confirmed plaintext runtime credential exposure**.

Do not upgrade that statement to “no secret was ever exposed anywhere.” The following boundaries remain explicitly unproven:

1. historical Vercel runtime logs outside the accessible query window/plan;
2. Vercel Production/Preview environment-variable inventory, which the connected interface does not expose;
3. external caches/clones not represented by current GitHub repository/fork state;
4. Resend fallback elimination until the Supabase Edge Function secret environment can be independently proven.

No new runtime authority, agent, service, database, or audit layer was introduced.
