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

## Release rule
Completion is only claimed after required GitHub checks pass, the migration is verified on DABBIR Mumbai, and the exact merged artifact has a successful Vercel production deployment.
