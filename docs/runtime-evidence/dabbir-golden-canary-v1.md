# DABBIR Golden Canary v1

Status: implementation candidate pending governed merge and first successful live run
Contract: `DABBIR_GOLDEN_CANARY_V1`

## Release contract

`candidate SHA -> exact protected Vercel Preview -> unprivileged candidate tests -> trusted main-only verifier -> exact Preview smoke -> disposable full customer journey -> no-drift proof -> immutable commit status -> governed merge -> existing Release Guardian -> production`

## Security boundary

- Candidate code is executed only in `candidate-tests`, which has read-only repository permission and no OIDC or status-write permission.
- The privileged verifier always checks out `main`, never the candidate branch, so a candidate cannot rewrite the harness that judges it.
- Vercel protected Preview access uses short-lived GitHub OIDC.
- Disposable QA bootstrap/seed/cleanup uses the isolated `dabbir-golden-canary-qa` Supabase Edge Function.
- That Edge Function accepts only GitHub OIDC for `barman-systems/pilot`, `refs/heads/main`, `workflow_dispatch`, and `.github/workflows/dabbir-golden-canary.yml@refs/heads/main`.
- No permanent Golden Canary owner password, WhatsApp password, or service-role credential is exposed to the workflow.

## Exactness rules

The gate fails closed unless `/api/release-evidence` proves all of the following before testing:

- candidate commit SHA exactly matches the requested SHA;
- environment is `preview`;
- Vercel project is `prj_HCTFdQo8Vc7FvZRdJ37H7KFYwpUq`;
- repository is `barman-systems/pilot`;
- a concrete `dpl_*` deployment ID exists.

The same SHA and deployment ID must still be active after the full journey, otherwise promotion is denied.

## Required tests

1. `npm run check:syntax` and full `npm test` on the exact candidate without privileged credentials.
2. Protected Preview identity and exact-release proof.
3. iPhone WebKit Arabic login/authentication fail-closed smoke using the trusted harness.
4. Full disposable owner + employee + customer + AI journey against the exact Preview using the existing production-grade journey harness.
5. Cleanup of the disposable QA tenant/users.
6. Post-journey deployment drift check.

## Promotion evidence

On success the workflow emits a 30-day artifact receipt containing the candidate SHA, Preview URL, deployment ID, run ID, PASS gates, `promotion_allowed=true`, and `fail_closed=true`.

It also writes the commit status context `DABBIR Golden Canary` directly onto the exact candidate SHA. Main branch protection is changed to require both `test` and `DABBIR Golden Canary`; therefore a missing, failed, or stale Canary result blocks merge.

## Inputs

The trusted workflow accepts only:

- `candidate_sha`: exact lowercase 40-character SHA.
- `canary_url`: bare HTTPS `*.vercel.app` Preview origin.

There are no reusable Canary user credentials in GitHub Actions.

## Operational completion condition

This implementation is not considered operational until PR #441 is merged, native main protection reports `DABBIR Golden Canary` as a required context, and a real workflow run against an exact Vercel Preview finishes successfully with an evidence artifact and SUCCESS commit status.
