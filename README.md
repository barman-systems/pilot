# DABBIR

Standalone source package for DABBIR products.

## Scope

This repository boundary owns DABBIR product runtime and channel integrations. It does not own the BARMAN control plane, ZAJEL commerce runtime, or R&A.

Current product modes:
- `dabbir_clinics` — synthetic-only; no patient data persistence.
- `dabbir_celebrities` — synthetic-only.

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

## Boundary

BARMAN may govern and observe DABBIR only through authenticated API/event contracts. DABBIR must not import BARMAN source code, share raw secrets, or directly read another product database.

## Safety state

- Preview-only runtime.
- External side effects disabled.
- Payments disabled.
- WhatsApp inbound signature verification is fail-closed.

## Commands

```bash
npm test
```

Target canonical repository: `barman-systems/pilot`.
