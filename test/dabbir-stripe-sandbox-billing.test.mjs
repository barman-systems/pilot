import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  DABBIR_OWNER_MONTHLY_AED,
  DABBIR_OWNER_PRICE_ID,
  DABBIR_TRIAL_DAYS,
  checkoutIdempotencyKey,
  publicBillingState,
  requestOrigin,
  safeBusinessId,
  verifyStripeSignature,
} from '../api/_billing-core.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const [core, checkout, portal, webhook, ui, shell, migration] = await Promise.all([
  read('api/_billing-core.js'),
  read('api/billing/checkout.js'),
  read('api/billing/portal.js'),
  read('api/billing/webhook.js'),
  read('api/dabbir-billing-ui.js'),
  read('api/app-recovery.js'),
  read('supabase/migrations/20260827173500_dabbir_stripe_sandbox_billing_v1.sql'),
]);

test('DABBIR owner plan is server-fixed to verified sandbox price and seven-day trial', () => {
  assert.equal(DABBIR_OWNER_PRICE_ID, 'price_1U8yRWLYIkiZam7bHaP2NhtT');
  assert.equal(DABBIR_OWNER_MONTHLY_AED, 129);
  assert.equal(DABBIR_TRIAL_DAYS, 7);
  assert.match(checkout, /line_items:\[\{price:DABBIR_OWNER_PRICE_ID,quantity:1\}\]/);
  assert.match(checkout, /trial_period_days=DABBIR_TRIAL_DAYS/);
  assert.doesNotMatch(checkout, /body\?\.price|body\.price|price_id.*body/i);
  assert.doesNotMatch(checkout, /automatic_tax/);
});

test('sandbox key policy fails closed on live or malformed Stripe secrets', () => {
  assert.match(core, /key\.startsWith\('sk_live_'\).*LIVE_BILLING_DISABLED/s);
  assert.match(core, /!key\.startsWith\('sk_test_'\).*INVALID_STRIPE_SANDBOX_KEY/s);
  assert.match(checkout, /LIVE_CHECKOUT_REJECTED/);
  assert.match(webhook, /event\.livemode.*LIVE_EVENT_REJECTED/s);
});

test('billing mutations are same-origin and owner-only', () => {
  assert.match(checkout, /requireSameOrigin\(req\)/);
  assert.match(portal, /requireSameOrigin\(req\)/);
  assert.match(core, /membership\.role\|\|' '\)\.toLowerCase\(\)!=='owner'|membership\.role\|\|''\)\.toLowerCase\(\)!=='owner'/);
  assert.match(core, /OWNER_APPROVAL_REQUIRED/);
  assert.match(ui, /function owner\(\).*membership\?\.role/s);
  assert.match(ui, /if\(!owner\(\)\)return/);
});

test('Stripe webhook requires a recent HMAC signature before parsing or persistence', () => {
  const secret = 'whsec_test_secret';
  const payload = Buffer.from('{"id":"evt_test","type":"noop","data":{"object":{}},"livemode":false}');
  const timestamp = 2_000_000_000;
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload.toString('utf8')}`).digest('hex');
  assert.equal(verifyStripeSignature(payload, `t=${timestamp},v1=${signature}`, secret, timestamp), true);
  assert.throws(() => verifyStripeSignature(payload, `t=${timestamp},v1=${'0'.repeat(64)}`, secret, timestamp), /INVALID_WEBHOOK_SIGNATURE/);
  assert.throws(() => verifyStripeSignature(payload, `t=${timestamp - 301},v1=${signature}`, secret, timestamp), /INVALID_WEBHOOK_TIMESTAMP/);
  const verifyAt = webhook.indexOf('verifyStripeSignature');
  const parseAt = webhook.indexOf('JSON.parse');
  const persistAt = webhook.indexOf('processedEvent(event.id)');
  assert.ok(verifyAt > 0 && parseAt > verifyAt && persistAt > parseAt);
});

test('billing data is tenant-owner readable, FORCE RLS, and event ledger is server-only', () => {
  assert.match(migration, /alter table public\.dabbir_billing_accounts force row level security/i);
  assert.match(migration, /m\.user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /m\.status = 'active'/i);
  assert.match(migration, /m\.role = 'owner'/i);
  assert.match(migration, /grant select on table public\.dabbir_billing_accounts to authenticated/i);
  assert.doesNotMatch(migration, /grant (insert|update|delete).*dabbir_billing_accounts.*authenticated/i);
  assert.match(migration, /alter table public\.dabbir_stripe_events force row level security/i);
  assert.match(migration, /revoke all on table public\.dabbir_stripe_events from public, anon, authenticated/i);
});

test('no card data is stored and subscription truth is webhook-driven', () => {
  assert.doesNotMatch(migration, /card_number|card_cvc|payment_method_details|client_secret/i);
  assert.match(webhook, /checkout\.session\.completed/);
  assert.match(webhook, /customer\.subscription\.updated/);
  assert.match(webhook, /invoice\.paid/);
  assert.match(webhook, /invoice\.payment_failed/);
  assert.match(webhook, /on_conflict=business_id/);
  assert.match(webhook, /on_conflict=stripe_event_id/);
});

test('public billing state and identifiers stay deterministic', () => {
  assert.equal(safeBusinessId('11111111-1111-4111-8111-111111111111'), '11111111-1111-4111-8111-111111111111');
  assert.equal(safeBusinessId('not-a-uuid'), null);
  assert.equal(checkoutIdempotencyKey('b', 'u', 0), checkoutIdempotencyKey('b', 'u', 599999));
  assert.notEqual(checkoutIdempotencyKey('b', 'u', 0), checkoutIdempotencyKey('b', 'u', 600000));
  assert.equal(requestOrigin({ headers: { host: 'app.example.com', 'x-forwarded-proto': 'http' } }), 'https://app.example.com');
  assert.throws(() => requestOrigin({ headers: { host: 'bad host' } }), /INVALID_REQUEST_HOST/);
  assert.deepEqual(publicBillingState(null), {
    plan: 'owner', status: 'not_subscribed', amount: 129, currency: 'AED', interval: 'month',
    trial_days: 7, trial_available: true, can_subscribe: true, can_manage: false,
  });
});

test('billing UI is mounted on the authoritative shell without replacing metric authority', () => {
  const billingAt = shell.indexOf('/api/dabbir-billing-ui');
  const metricsAt = shell.indexOf('/api/verified-metrics-ui');
  assert.ok(billingAt > 0 && metricsAt > billingAt);
  assert.match(ui, /Stripe Sandbox فقط/);
  assert.match(ui, /Stripe Sandbox only/);
  assert.match(ui, /\/api\/billing\/status/);
  assert.match(ui, /\/api\/billing\/checkout/);
  assert.match(ui, /\/api\/billing\/portal/);
  assert.doesNotMatch(ui, /sk_test_|sk_live_|SUPABASE_SERVICE_ROLE_KEY/);
});
