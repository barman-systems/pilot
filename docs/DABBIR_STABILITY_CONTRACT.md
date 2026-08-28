# DABBIR Stability Contract

This contract exists because repeated defects were not isolated coding mistakes. They were symptoms of competing owners, patch-on-patch UI composition, legacy fallback leakage, and release evidence that could become detached from the exact customer journey.

## Non-negotiable rule

A bug is not closed when its visible symptom disappears. It is closed only when:

1. the root cause is identified;
2. the architectural failure class is named;
3. the competing owner or unsafe fallback is removed or explicitly isolated;
4. an invariant prevents the same class from returning;
5. the exact production artifact passes the customer journey that exposed the failure.

## Single-owner rules

- Primary navigation is authored by the base owner journey, not by feature modules.
- Service catalog access belongs under More. A service feature must never inject a sixth primary destination.
- Store-specific navigation adaptation is a temporary exception and must migrate into the central router during phase 2.
- Auth/session visibility is controlled by the canonical auth-session gate. CSS or feature modules must not force hidden app navigation visible.
- Tenant WhatsApp state is tenant-scoped. Missing tenant connection data must fail closed as not configured; it must never inherit a global or legacy phone identity.
- WhatsApp linked/authorized is not operational. Operational requires verified real inbound + verified real outbound evidence.
- Verified metrics are authoritative. Bounded UI arrays are never a fallback for KPI truth.

## Shell complexity freeze

The current shell is already too layered. Stabilization therefore starts by freezing growth:

- injected API UI modules are allowlisted and unique;
- retired presentation layers cannot return;
- a new guard/overlay module is not an acceptable default fix;
- the module count may go down without special approval;
- raising the module ceiling requires an explicit architecture change with a removed competing owner. Adding a patch and raising the ceiling together is prohibited.

## Release truth

The release state machine is:

`BUILT -> EXACT_SHA_TESTED -> DEPLOYED -> PRODUCTION_JOURNEY_VERIFIED`

A release cannot skip a state. A blocked or skipped browser journey is not PASS. A CI run on another SHA is not production evidence.

The required production journey before launch includes:

- signup / login / logout / reload;
- business type selection and activity-specific navigation;
- Arabic and English;
- iPhone Safari plus desktop baseline;
- core navigation and More destinations;
- WhatsApp connect / disconnect / reconnect;
- real inbound WhatsApp message;
- persisted conversation and customer routing;
- approved real outbound reply and delivery evidence;
- degraded/recovery behavior when a dependency is unavailable.

## Root Cause Registry format

Every recurring or P0/P1 defect must record:

`SYMPTOM -> ROOT_CAUSE -> FAILURE_CLASS -> OWNER -> INVARIANT -> TEST_EVIDENCE -> PRODUCTION_EVIDENCE`

Examples of failure classes:

- `MULTIPLE_UI_OWNERS`
- `SESSION_RACE`
- `LEGACY_TENANT_LEAK`
- `FALSE_READINESS`
- `QA_FALSE_GREEN`
- `ARTIFACT_DRIFT`
- `CONFIGURATION_DRIFT`
- `UNVERIFIED_DATA_FALLBACK`

## Stabilization phases

### Phase 1 — Freeze and invariants

Stop architecture growth, remove obvious competing navigation ownership, and turn known failure classes into failing tests.

### Phase 2 — Collapse competing owners

Replace stacked wrappers around `renderAll`, `showScreen`, navigation, and auth visibility with a small lifecycle/router/state registry. Remove dead compatibility transforms from `api/app.js` and reduce `app-recovery` injection count.

### Phase 3 — Explicit state machines

Make Auth, WhatsApp, integrations, and release readiness explicit state machines. UI must render state; it must not infer or invent it.

### Phase 4 — Launch gate

Only the exact production SHA that passes the full bilingual iPhone/desktop journey can be classified launch-ready.
