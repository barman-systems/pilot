# DABBIR Business OS research archive — 2026-08-26

Status: **HISTORICAL / NON-AUTHORITATIVE**

This directory preserves architecture and market research created on the retired experimental branch `dabbir-business-os-v1` at commit `d9d26cb57f40c819c9cd6e593f81a5b141bfc1a4`.

## Authority

The authoritative DABBIR product, runtime, database contract, UI, release evidence, and implementation source is the repository default branch `main`. Nothing in this archive overrides current code, migrations, security controls, release gates, product state, or verified production evidence.

The old branch assumption that “DABBIR Business OS” must remain a separate product/environment is **superseded**. Useful research principles are retained here as design inputs only.

## Intentionally not archived

The old `business-os.html` foundation preview and `business-os/modules.json` manifest are intentionally excluded because they can be mistaken for an executable/product source of truth. They remain discoverable in Git history at the source commit above.

## Retained design principles

- one canonical data model and explicit state machines;
- permission before action, fail-closed authorization, immutable/auditable business writes;
- AI and integrations are governed principals, never hidden superusers;
- provider-specific payloads stay behind adapters while DABBIR owns business semantics and canonical state;
- externally retryable mutations require idempotency and verifiable postconditions;
- UAE/GCC compliance claims require scoped, current legal verification rather than marketing assumptions;
- features must measurably improve time, cost, revenue, risk, control, service, or productivity;
- no dashboard, preview, or mock state counts as operational proof.

These principles may inform future implementation, but current behavior is determined only by authoritative `main` plus exact deployed-artifact verification.