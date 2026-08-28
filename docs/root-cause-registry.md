# DABBIR Root Cause Registry

| Incident class | Symptom | Root cause | Architectural class | Invariant / permanent control | Status |
|---|---|---|---|---|---|
| iPhone auth gate | Login returned 200 but UI stayed on auth / nav leaked into login | Session became observable after the immediate boot; late CSS forced bottom nav visible | SESSION_RACE + MULTIPLE_UI_OWNERS | Canonical auth-session verification + auth gate loaded last + hidden navigation regression test | CONTROLLED |
| Service sixth tab | Services appeared as a sixth primary destination | Feature module injected its own navigation button | MULTIPLE_UI_OWNERS | Service module may not inject primary navigation; Services lives under More | REMOVED_IN_STABILIZATION_V1 |
| Store operations ownership | Store operations screen disappeared / was overwritten | Service module claimed shared operations screen before business type was known | MULTIPLE_SCREEN_OWNERS | Known activity required before service screen ownership; future target is central screen registry | CONTROLLED / MIGRATION_PENDING |
| WhatsApp legacy number | New tenant could display an old/global WhatsApp identity | Tenant status fell back to global legacy configuration | LEGACY_TENANT_LEAK | Tenant status fails closed with TENANT_WHATSAPP_NOT_LINKED / BUSINESS_CONTEXT_REQUIRED | CONTROLLED |
| WhatsApp false readiness | Linked/authorized connection could look operational | Authorization state was treated as message-path evidence | FALSE_READINESS | OPERATIONAL requires real non-simulated inbound + outbound + verified external outcome | CONTROLLED |
| QA false green | Protected browser journey could be skipped while workflow ended green | Blocked execution was not a failing evidence state | QA_FALSE_GREEN | Blocked/skipped journey exits non-zero and cannot count as PASS | CONTROLLED |
| Deployment comparison drift | Test-only commit could rebuild because comparison used stale deployment SHA | Release comparison source was not the direct parent | ARTIFACT_DRIFT | Ignore gate compares triggering commit with direct parent and fails safe | CONTROLLED |
| UI patch growth | Fixes repeatedly added guards/overlays that depended on load order | Shell had no hard complexity ceiling or ownership contract | PATCH_ON_PATCH | Explicit shell allowlist, unique modules, max module ceiling, retired-module denylist | ACTIVE |

## Closure rule

No row is `CLOSED` until the associated invariant is in CI and the exact Production artifact has passed the journey that originally exposed the defect. `CONTROLLED` means recurrence is guarded but broader architectural consolidation can still be pending.
