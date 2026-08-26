# PILOT

Standalone source package for PILOT products.

## Scope

This repository boundary owns PILOT product runtime and channel integrations. It does not own the BARMAN control plane, ZAJEL commerce runtime, or R&A.

Current product modes:
- `pilot_clinics` — synthetic-only; no patient data persistence.
- `pilot_celebrities` — synthetic-only.

## Boundary

BARMAN may govern and observe PILOT only through authenticated API/event contracts. PILOT must not import BARMAN source code, share raw secrets, or directly read another product database.

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
