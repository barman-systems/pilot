# DABBIR Root Cause Registry

| Incident class | Symptom | Root cause | Architectural class | Invariant / permanent control | Status |
|---|---|---|---|---|---|
| iPhone auth gate | Login returned 200 but UI stayed on auth / nav leaked into login | Session became observable after the immediate boot; late CSS forced bottom nav visible | SESSION_RACE + MULTIPLE_UI_OWNERS | Canonical auth-session verification + auth gate loaded last + hidden navigation regression test | CONTROLLED |
| Service sixth tab | Services appeared as a sixth primary destination | Feature module injected its own navigation button | MULTIPLE_UI_OWNERS | Service module may not inject primary navigation; Services lives under More | REMOVED_IN_STABILIZATION_V1 |
| Store operations ownership | Store operations screen disappeared / was overwritten | Service module claimed shared operations screen before business type was known | MULTIPLE_SCREEN_OWNERS | Known activity required before service screen ownership; future target is central screen registry | CONTROLLED / MIGRATION_PENDING |
| WhatsApp legacy number | New tenant could display an old/global WhatsApp identity | Tenant status fell back to global legacy configuration | LEGACY_TENANT_LEAK | Tenant status fails closed with TENANT_WHATSAPP_NOT_LINKED / BUSINESS_CONTEXT_REQUIRED | CONTROLLED |
| WhatsApp false readiness | Linked/authorized connection could look operational | Authorization state was treated as message-path evidence | FALSE_READINESS | OPERATIONAL requires real non-simulated inbound + outbound + verified external outcome | CONTROLLED |
| QA false green | Protected browser journey could be skipped while workflow ended green | Blocked execution was not a failing evidence state | QA_FALSE_GREEN | Blocked/skipped journey exits non-zero and cannot count as PASS | CONTROLLED |
| Deployment comparison drift | A failed runtime commit could be followed by a test/docs commit that Vercel ignored, leaving the combined candidate unverified | Ignored Build Step treated incremental Git history as sufficient release evidence; ignored commits could advance the comparison baseline | ARTIFACT_DRIFT + QA_FALSE_GREEN | Every non-main branch runs the full Vercel build gate; main compares from the last successful baseline and any uncertainty/runtime drift builds fail-safe | CONTROLLED |
| Runtime engine drift | Vercel/Control Plane required Node 24.x while package.json forced Node 22.x and its test encoded the stale value | Runtime version had multiple unsynchronized sources of truth | CONFIG_SOURCE_DRIFT | package.json and package-lock.json must both equal the authoritative Node 24.x line; regression test locks equality | CONTROLLED |
| UI patch growth | Fixes repeatedly added guards/overlays that depended on load order | Shell had no hard complexity ceiling or ownership contract | PATCH_ON_PATCH | Explicit shell allowlist, unique modules, max module ceiling, retired-module denylist | ACTIVE |

## Closure rule

No row is `CLOSED` until the associated invariant is in CI and the exact Production artifact has passed the journey that originally exposed the defect. `CONTROLLED` means recurrence is guarded but broader architectural consolidation can still be pending.
