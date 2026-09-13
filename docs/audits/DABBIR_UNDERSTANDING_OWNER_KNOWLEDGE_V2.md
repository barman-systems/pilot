# DABBIR Understanding V2 — Owner knowledge follow-through

Base: production main `5966a5da8cc13e06c355a0c14efb74e0ef7690fc`, deployment `dpl_9e4p9SSko1kPev2tk5dsdCqwPewd`, observed 2026-09-08. The active-account SQL correction from #579 is retained. No new migration is required by this change.

## Owner journey

The existing **سياسات دبّر / DABBIR Policies** dialog now contains service meanings. An owner selects a service from their scoped catalog and saves a proposal. Saving never approves it. A separate click approves; approved meanings can be revoked, and revoked/superseded versions explicitly approved again. Status, version and up to four recent audit events are visible. Only service mappings are offered because they are the mappings currently consumed by the understanding reducer. Existing low-risk decision policies remain in the same dialog.

`GET /api/understanding-knowledge` adds catalog targets (200 maximum, only id/name/active) and proposal audit events (100 maximum, no customer text), with the verified owner's JWT, explicit business filter and RLS. The browser discards stale responses on tenant changes, closes the previous dialog, prevents detached controls from submitting in a new tenant, and prevents double submission. Loading failures show retry rather than claiming an empty catalog.

The production customer journey now uses its own disposable QA tenant to create a service and exercise proposal → approve → revoke → restore through the shipped browser UI, with independent authenticated API readback and four required audit event types. This is an owner web journey, not evidence of a real Meta inbound.

## Fresh readiness evidence

The former default `docs/evidence/dabbir-bar12-technical-review.json` attests a September 4 release. A source-controlled file cannot automatically attest later SHA/deployment pairs. BAR-12 now accepts a bounded JSON review **after deployment**, either through `workflow_dispatch.inputs.technical_review_json` or repository variable `DABBIR_BAR12_TECHNICAL_REVIEW_JSON`. The supplied data is passed through an environment variable, never interpolated into shell code, and saved as a run artifact. There is no fallback to the historical review.

All existing runtime identity, freshness, security, Slack channel, actual message identity and readback requirements remain mandatory. Missing input is `BAR12_LIVE_TECHNICAL_REVIEW_REQUIRED`; stale/false evidence remains blocked. WhatsApp, financial and legal gates remain unpromoted. Do not refresh timestamps or change SHA fields to manufacture a pass. Collect the actual Vercel query, authorized alert delivery and readback, and Supabase security review before supplying JSON. A deployment-scoped query over a 24-hour lookback must not be described as 24 hours of deployment uptime.

No Slack test message was sent in this continuation. No new real Meta inbound, semantic conversation or event was present in the live read at the start of this continuation. Actual WhatsApp acceptance remains unverified.

## Validation

Results and exact merge/deployment evidence are added to the PR after checks finish. Local API/UI tests exercise active-owner authorization, suspended/foreign users, all three upstream read failures, malformed data, distinct proposal approval, Arabic/English lifecycle, cross-tenant races, duplicate submits, role removal, and text-only rendering of untrusted aliases. Existing SQL RLS/account-suspension regression tests remain required.
