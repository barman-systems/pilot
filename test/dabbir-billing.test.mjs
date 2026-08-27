import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DABBIR_OWNER_PRICE_ID,
  DABBIR_TRIAL_DAYS,
  checkoutIdempotencyKey,
  integrationIdentifier,
  publicBillingState,
  requestOrigin,
  safeBusinessId,
} from '../api/_billing-core.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('sandbox plan is fixed server-side at AED 129 monthly with seven-day trial', () => {
  const checkout = read('api/billing/checkout.js');
  assert.equal(DABBIR_OWNER_PRICE_ID, 'price_1U8yRWLYIkiZam7bHaP2NhtT');
  assert.equal(DABBIR_TRIAL_DAYS, 7);
  assert.match(checkout, /line_items:\s*\[\{ price: DABBIR_OWNER_PRICE_ID, quantity: 1 \}\]/);
  assert.match(checkout, /trial_period_days: trialAvailable \? DABBIR_TRIAL_DAYS : undefined/);
  assert.doesNotMatch(checkout, /automatic_tax/);
  assert.doesNotMatch(checkout, /payment_method_types/);
  assert.doesNotMatch(checkout, /body\?\.price|body\.price/);
});

test('live Stripe keys and live webhook events fail closed', () => {
  const core = read('api/_billing-core.js');
  const webhook = read('api/billing/webhook.js');
  assert.match(core, /key\.startsWith\('sk_live_'\)/);
  assert.match(core, /LIVE_BILLING_DISABLED/);
  assert.match(webhook, /if \(event\.livemode\).*LIVE_EVENT_REJECTED/);
});

test('webhook verifies signature before any admin persistence', () => {
  const webhook = read('api/billing/webhook.js');
  const verifyAt = webhook.indexOf('webhooks.constructEvent');
  const lookupAt = webhook.indexOf('processedEvent(event.id)');
  assert.ok(verifyAt > 0 && lookupAt > verifyAt);
  assert.match(webhook, /dabbir_stripe_events\?select=stripe_event_id,status/);
  assert.match(webhook, /on_conflict=business_id/);
});

test('only an active owner can start or manage billing', () => {
  const core = read('api/_billing-core.js');
  assert.match(core, /membership\.role.*owner/);
  assert.match(core, /OWNER_APPROVAL_REQUIRED/);
  const migration = read('supabase/migrations/20260827082855_dabbir_stripe_billing_v19.sql');
  assert.match(migration, /m\.role = 'owner'/);
  assert.match(migration, /grant select on table public\.dabbir_billing_accounts to authenticated/);
  assert.match(migration, /revoke all on table public\.dabbir_stripe_events from authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table public\.dabbir_stripe_events to service_role/);
});

test('identifiers, origins, and public state are deterministic and safe', () => {
  assert.equal(safeBusinessId('11111111-1111-4111-8111-111111111111'), '11111111-1111-4111-8111-111111111111');
  assert.equal(safeBusinessId('not-a-uuid'), null);
  assert.match(integrationIdentifier(), /^[a-z]{8}$/);
  assert.equal(requestOrigin({ headers: { host: 'app.example.com', 'x-forwarded-proto': 'http' } }), 'https://app.example.com');
  assert.throws(() => requestOrigin({ headers: { host: 'bad host' } }), /INVALID_REQUEST_HOST/);
  assert.equal(checkoutIdempotencyKey('b', 'u', 0), checkoutIdempotencyKey('b', 'u', 599999));
  assert.notEqual(checkoutIdempotencyKey('b', 'u', 0), checkoutIdempotencyKey('b', 'u', 600000));
  assert.deepEqual(publicBillingState(null), {
    plan: 'owner', status: 'not_subscribed', amount: 129, currency: 'AED', interval: 'month',
    trial_days: 7, trial_available: true, can_subscribe: true, can_start_trial: true, can_manage: false,
  });
});
