# DABBIR WhatsApp service-menu loop — root cause evidence

Production incident observed 2026-09-08 around 06:06–06:07 UTC on the live WhatsApp path.

## Observed failure chain

1. `شو خدماتكم` produced the verified database list `1) تنظيف منزل — 20 AED` and `2) غسيل سجاد — 40 AED`.
2. Reply `2` produced `أي خيار واحد تقصد؟` instead of resolving the second presented service.
3. Reply `غسيل سجاد` correctly grounded the service entity to the active database service and price, but the semantic state retained `intent=SERVICE_DISCOVERY`, so the same list was rendered again.
4. The bare numeric `2` also leaked into the time parser and became an unsupported `2 AM/PM` ambiguity because the runtime suppressed bare-number time parsing only for `choose_slot`.
5. The same conversation had previously been returned from human takeover to AI, but its durable conversation-state row still held `pending_action=handoff` because the return-to-AI RPC did not clear it.

## Root causes

This was a state-machine defect, not a weak-model problem:

- text service-menu presentation was not persisted as a verified ordered choice set;
- there was no durable `choose_service` state;
- ordinal resolution therefore had no trustworthy service list to bind `2`/`الثاني` to;
- an exact service selection after `SERVICE_DISCOVERY` did not transition into the booking goal;
- unsupported menu ordinals could leak into time parsing;
- return-to-AI left stale handoff pending state.

## Repair contract

- A fallback text service menu is persisted as `choose_service` before delivery and marked `presented=true` only after a provider message id is finalized.
- `2`, `الثاني`, and an exact offered service name resolve to the same tenant/branch-scoped service only from an unexpired verified presentation.
- Exact active service names also recover conversations affected by the pre-fix loop without trusting model inference.
- A grounded service choice is reduced through the same catalog-service path, which changes the semantic goal to booking and asks only for remaining booking facts.
- The old unsupported ordinal-as-time artifact is removed only while repairing a legacy `SERVICE_DISCOVERY` selection.
- Returning a conversation to AI clears `pending_action=handoff`, and the migration repairs only stale handoff rows with no active human handoff.
- Unverified, expired, out-of-range, or ambiguous ordinals cannot select a service or trigger a mutation.

## Production proof required after merge

Code/tests alone are not final proof. After all required checks pass, the migration must be applied, the exact merged SHA must be READY in Vercel Production, and a new signed Meta conversation must verify `شو خدماتكم → 2` and `شو خدماتكم → غسيل سجاد` without a repeated menu.
