# DABBIR | دبّر

Authoritative source repository for the DABBIR product runtime, web experience, native iPhone client, database contracts, release gates, and channel integrations.

## Authority boundary

`main` in `barman-systems/pilot` is the code source of truth for DABBIR. Historical research and retired PILOT-era surfaces are non-authoritative and must not be used as runtime or release truth.

This repository does not own the BARMAN control plane, ZAJEL commerce runtime, or R&A. BARMAN may govern and observe DABBIR only through authenticated API/event contracts; DABBIR must not import BARMAN source code, share raw secrets, or directly read another product database.

## Product scope

The runtime recognizes these DABBIR contexts:
- `dabbir_businesses` — primary small-business owner context.
- `dabbir_clinics` — specialized clinic context; medical diagnosis/prescribing is outside DABBIR scope.
- `dabbir_celebrities` — specialized creator/celebrity coordination context.

A context name is not evidence that every vertical capability is production-ready. Release/readiness status comes from executable gates and exact-artifact evidence, not from module presence.

## Mandatory bilingual product standard

DABBIR is Arabic + English by default across the entire product, not only conversation views.

This requirement applies to web and app surfaces including authentication, onboarding, dashboard, navigation, conversations, appointments, tasks, notifications, settings, help, errors, empty states, status messages, legal/consent copy, and customer-facing messages.

- Arabic uses RTL.
- English uses LTR.
- A visible language switch must be available in the product experience.
- Every new user-facing feature must ship with both Arabic and English copy.
- Conversation translation supports one-tap full-conversation translation and single-message translation while preserving the original text.
- A feature with single-language UI is not release-complete.

The machine-readable source of truth is `config/i18n-contract.json`; locale parity is enforced by automated tests.

## Security and tenant truth

- Authentication and tenant authorization fail closed.
- DABBIR tenant data is protected by RLS/authorization contracts; service credentials must never be exposed to clients.
- A tenant must never inherit another/global WhatsApp identity.
- Meta authorization alone does not mean WhatsApp is `OPERATIONAL`; operational status requires real verified message-path evidence.
- Mock, synthetic, preview, or fixture data must never count as production proof.
- External actions must preserve permission, provider, idempotency, timeout, and verification gates rather than assuming success.

## Current release truth

- DABBIR has protected/prelaunch Vercel production deployments and exact-SHA release verification; this does not mean public general availability.
- The native iPhone application is React Native/Expo, not a WebView wrapper.
- Native static checks and unsigned Release compilation gates are executable in CI.
- `APP_STORE_READY=FALSE` until Apple signing, App Store Connect configuration, signed Distribution/TestFlight artifact, and exact-build real-device QA are verified.
- Stripe/App Store billing must not be described as live unless the corresponding production provider configuration and verified transaction evidence exist.
- Supabase leaked-password protection and GitHub `main` branch protection remain external platform controls until their live platform state verifies them as enabled.

See `docs/app-store/APP_STORE_RELEASE_PLAN.md`, `docs/root-cause-registry.md`, and `config/dabbir-architecture-ownership.json` for the current release, recurrence-prevention, and ownership contracts.

## Verification rule

A completion claim must follow:

`ACTION → ARTIFACT → TEST → EVIDENCE → VERIFICATION`

CI success on source is not a substitute for exact production/TestFlight verification when the claim depends on a deployed or signed artifact.

## Commands

```bash
npm test
```

Canonical repository: `barman-systems/pilot`.
