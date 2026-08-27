# DABBIR Stripe Sandbox E2E Evidence — 2026-08-27

## Verdict

**PASS — Stripe Sandbox backend lifecycle verified end to end.**

Scope is strictly Stripe Sandbox / test mode. No Stripe Live key, live payment, live customer charge, payout, or real-money movement was used.

## Authoritative integration state

- DABBIR owner subscription price: `price_1U8yRWLYIkiZam7bHaP2NhtT`
- Amount: AED 129/month (`unit_amount=12900`, `currency=aed`)
- Trial: 7 days
- Price `livemode=false`
- Price metadata: `app=dabbir`, `plan=owner`, `environment=sandbox`, `trial_days=7`
- Shared webhook endpoint: `https://spohjzrsymsmzsseygtw.supabase.co/functions/v1/barman-stripe-webhook`
- Supabase webhook function verified after hotfix: version 13 ACTIVE
- DABBIR billing tables use FORCE RLS; client roles cannot write billing state or read the Stripe event ledger.

## Scenario A — trial -> successful charge -> active -> cancel

Temporary DABBIR demo business: `da4bc597-8a7b-4d8a-b28f-7f6ed97e1bbd`
Stripe Sandbox customer: `cus_V9R2CqzL39CJIV`
Stripe Sandbox subscription: `sub_1U98AQLYIkiZam7bG2lIFojV`

Observed sequence:

1. Subscription created at AED 129/month with 7-day trial.
2. DABBIR webhook processed `customer.subscription.created`: `evt_1U98ARLYIkiZam7bbehTdPPt`.
3. Initial zero-amount trial invoice webhook processed as `invoice.paid`: `evt_1U98ARLYIkiZam7b4MCU1nsr`.
4. Supabase billing truth became `status=trialing` with trial end 2026-09-03.
5. A successful Stripe test card was attached and the trial was ended in Sandbox.
6. DABBIR webhook processed `customer.subscription.updated`: `evt_1U98BmLYIkiZam7bD57tRNlE`.
7. DABBIR webhook processed the real Sandbox subscription charge invoice as `invoice.paid`: `evt_1U98BmLYIkiZam7bI6n2JsS0`.
8. Supabase billing truth became `status=active`, `last_invoice_status=paid`, with the next period ending 2026-09-27.
9. Subscription was canceled without proration or a final invoice.
10. DABBIR webhook processed `customer.subscription.deleted`: `evt_1U98FPLYIkiZam7b3oaeZvYK`.

## Scenario B — trial -> failed charge -> past_due -> card replacement -> successful retry -> active -> cancel

Temporary DABBIR demo business: `94ba1e74-68f1-4af5-86c2-eac642031f10`
Stripe Sandbox customer: `cus_V9R5NO5BX0q5nH`
Stripe Sandbox subscription: `sub_1U98DWLYIkiZam7bzNN8IZHh`

Observed sequence:

1. Stripe's attachable failure test source (`tok_chargeCustomerFail`) was attached successfully.
2. Subscription was created with the same DABBIR price and trial metadata.
3. Webhook processed `customer.subscription.created`: `evt_1U98DXLYIkiZam7bMy0GZ9Lf`.
4. After ending the trial, Stripe attempted the AED 129 charge and failed as intended.
5. Webhook processed `customer.subscription.updated`: `evt_1U98DkLYIkiZam7beQHUsgh3`.
6. Webhook processed `invoice.payment_failed`: `evt_1U98DkLYIkiZam7byvEiBMx5`.
7. Supabase billing truth became `status=past_due`, `last_invoice_status=payment_failed`.
8. Customer payment source was replaced with a successful Stripe test card.
9. Stripe retried the open invoice automatically.
10. Webhook processed `invoice.paid`: `evt_1U98EHLYIkiZam7b1HeCV2gS`.
11. Webhook processed `customer.subscription.updated`: `evt_1U98EHLYIkiZam7b9iqzKstK`.
12. Supabase billing truth returned to `status=active`, `last_invoice_status=paid`.
13. Subscription was canceled.
14. Webhook processed `customer.subscription.deleted`: `evt_1U98EiLYIkiZam7bMHasCtaz`.
15. Supabase billing truth became `status=canceled`.

## Cleanup

- Both temporary DABBIR businesses were created with `demo_mode=true`, `owner_id=null`, and zero memberships.
- Both temporary DABBIR businesses were deleted after both cancellation webhooks were confirmed processed.
- Verification after cleanup: 0 test businesses remain and 0 test billing rows remain in DABBIR.
- Stripe Sandbox customers remain only because the connected Stripe tool did not expose a customer-delete operation. Both have no active subscription and are labeled `e2e_status=completed`, `active_subscription=false`.
- Stripe event ledger rows are intentionally retained as server-side audit evidence.

## What this PASS proves

This proves the real Sandbox backend chain:

`Stripe Sandbox subscription -> signed Stripe webhook -> Supabase Edge Function -> idempotent DABBIR event ledger -> DABBIR billing account state`

The following states were proven with real Stripe Sandbox resources and webhook delivery:

`trialing -> active/paid -> past_due/payment_failed -> active/paid -> canceled`

## Remaining boundary

This evidence does **not** claim that a logged-in owner's browser session has completed the Stripe-hosted Checkout UI through `/api/billing/checkout`. That surface is protected by DABBIR authentication, same-origin checks, owner-role checks, and the server bridge. Its code/CI/Preview contract is verified, but one authenticated owner-session acceptance test remains before claiming the complete UI-to-Stripe journey PASS.

Stripe Live remains disabled and outside the scope of this evidence.
