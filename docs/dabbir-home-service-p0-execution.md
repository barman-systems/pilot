# DABBIR Home Service P0 — Execution Evidence

## Decision
Home service is a generic DABBIR service capability, not a separate product vertical and not a new primary-navigation destination. It extends the authoritative appointments surface.

## P0 scope
- Enable/disable home service per business.
- Customer service address and optional coordinates.
- Travel-time buffer.
- Visit fee.
- Field execution state: scheduled, in route, arrived, in service, completed, cancelled.
- Tenant-scoped RLS and explicit authenticated Data API grants.
- Arabic and English UI.

## Architecture constraint
The shell remains capped at 26 injected UI modules. Home service replaces the deferred owner-decision-memory UI slot rather than increasing the shell ceiling.

## Verification
The dedicated regression test asserts navigation ownership, module count, schema constraints, RLS/grants, authentication/origin enforcement, tenant scoping, bilingual copy, and field states.

The release candidate was aligned with protected `main` commit `88c9e81ba755ccf5c20e0027aae51a9b6d4011fe` for the Owner Away QA/OIDC changes, then synchronized with production commit `5d4e9348cbfb15c39824d4f96c972f01567cbd2c` after the BARMAN Executive OS owner command center v26 passed its required check and merged. The final Home Service required check therefore covers both P0 changes on the current protected production base.

## Release rule
Completion is only claimed after required GitHub checks pass, the migration is verified on DABBIR Mumbai, and the exact merged artifact has a successful Vercel production deployment.
