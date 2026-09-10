# DABBIR Single Delivery Mode Authority — 2026-09-10

## Production symptom

Production SHA `dda4bee2ffc247df70ec4ab5ceaf62353134a003` completed the main AI journey but failed the required cognitive continuity probe in the English iPhone journey wrapper. The live real-model probe selected service `خارجي`, then kept asking for `delivery_mode` even though the synthetic service contract authorizes exactly one mode: `MOBILE`.

Observed turns from the Production evidence artifact:

- `شو خدماتكم` → service menu.
- `أبا غسيل خارجي` → booking goal retained, service resolved, but `pending_field=delivery_mode`; an untrusted model candidate also set vehicle `saloon`.
- `ستيشن` → vehicle correctly grounded as `station`, but `pending_field` incorrectly remained `delivery_mode`.

This made `vehicle_question=false` and `next_required_field=false` while the other safety checks stayed true.

## Root cause

`applyActivityRequirements` correctly auto-grounded a delivery mode from `DATABASE_FACT` only when `state.entities.delivery_mode` was absent. A semantic provider is allowed to propose a bounded `AI_INFERENCE` candidate. When the provider proposed `MOBILE` with confidence reduced to `0.5`, that untrusted candidate occupied `state.entities.delivery_mode` before activity requirements were applied. Because the field was no longer absent, the single authoritative database mode was not installed. `resolveOperationalRequirements` then correctly rejected the untrusted candidate and marked `delivery_mode` missing.

The bug was therefore an authority-precedence defect, not a missing prompt and not a stale test: an untrusted model candidate could shadow a stronger single-mode business contract without gaining execution authority.

## Repair

When a service contract contains exactly one non-`HYBRID` delivery mode, an identical `AI_INFERENCE` candidate is replaced by the database-authorized mode before requirement resolution. An explicit conflicting customer request remains unresolved and is never silently overwritten.

No model gains execution authority. Tenant, branch, service, RLS, slot, confirmation and mutation gates are unchanged.

## Regression contract

`test/dabbir-single-delivery-mode-authority-regression.test.mjs` proves both sides:

1. identical ungrounded model guess → database mode wins; `delivery_mode` is not missing and the next car-wash requirement is `vehicle`;
2. explicit conflicting mode → remains unresolved; no silent coercion to the configured mode.

## Rollout rule

Do not merge unless required CI is green. After merge, rerun the exact Production full-customer journey and require the real-model cognitive continuity probe to pass before using the resulting SHA as the refactoring baseline.
