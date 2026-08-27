import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import {
  DABBIR_OWNER_MONTHLY_AED,
  DABBIR_OWNER_PRICE_ID,
  DABBIR_TRIAL_DAYS,
  checkoutIdempotencyKey,
  publicBillingState,
  requestOrigin,
  safeBusinessId,
} from '../api/_billing-core.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const [core, checkout, portal, edgeCheckout, edgeWebhook, ui, shell, migration] = await Promise.all([
  read('api/_billing-core.js'),
  read('api/billing/checkout.js'),
  read('api/billing/portal.js'),
  read('supabase/functions/barman-stripe-checkout/index.ts'),
  read('supabase/functions/barman-stripe-webhook/index.ts'),
  read('api/dabbir-billing-ui.js'),
  read('api/app-recovery.js'),
  read('supabase/migrations/20260827181057_dabbir_stripe_sandbox_billing_v1.sql'),
]);

test('DABBIR owner plan is server-fixed to verified sandbox price and seven-day trial', () => {
  assert.equal(DABBIR_OWNER_PRICE_ID, 'price_1U8yRWLYIkiZam7bHaP2NhtT');
  assert.equal(DABBIR_OWNER_MONTHLY_AED, 129);
  assert.equal(DABBIR_TRIAL_DAYS, 7);
  assert.match(edgeCheckout, /DABBIR_PRICE_ID='price_1U8yRWLYIkiZam7bHaP2NhtT'/);
  assert.match(edgeCheckout, /line_items\[0\]\[price\].*DABBIR_PRICE_ID/s);
  assert.match(edgeCheckout, /trial_available===true.*trial_period_days.*'7'/s);
  assert.doesNotMatch(checkout, /body\?\.price|body\.price|price_id.*body/i);
  assert.doesNotMatch(edgeCheckout, /automatic_tax/);
});

test('Stripe execution is isolated in Supabase and DABBIR rejects live or malformed keys', () => {
  assert.doesNotMatch(core, /process\.env\.STRIPE_SECRET_KEY|api\.stripe\.com/);
  assert.match(core, /functions\/v1\/barman-stripe-checkout/);
  assert.match(core, /x-dabbir-billing-bridge':'v1'/);
  assert.match(edgeCheckout, /key\.startsWith\('sk_live_'\).*LIVE_BILLING_DISABLED/s);
  assert.match(edgeCheckout, /!key\.startsWith\('sk_test_'\).*INVALID_STRIPE_SANDBOX_KEY/s);
  assert.match(edgeWebhook, /key\.startsWith\('sk_live_'\).*LIVE_BILLING_DISABLED/s);
  assert.match(edgeWebhook, /!key\.startsWith\('sk_test_'\).*INVALID_STRIPE_SANDBOX_KEY/s);
});

test('billing mutations are same-origin, owner-only, and bridge calls are server-authenticated', () => {
  assert.match(checkout, /requireSameOrigin\(req\)/);
  assert.match(portal, /requireSameOrigin\(req\)/);
  assert.match(core, /membership\.role\|\|''\)\.toLowerCase\(\)!=='owner'/);
  assert.match(core, /OWNER_APPROVAL_REQUIRED/);
  assert.match(edgeCheckout, /actual===`Bearer \$\{expected\}`/);
  assert.match(edgeCheckout, /x-dabbir-billing-bridge.*==='v1'/);
  assert.match(ui, /function owner\(\).*membership\?\.role/s);
  assert.match(ui, /if\(!owner\(\)\)return/);
});

test('shared Stripe webhook verifies signature and timestamp before parsing or persistence', () => {
  assert.match(edgeWebhook, /Math\.abs\(Date\.now\(\)\/1000-ts\)>300/);
  assert.match(edgeWebhook, /crypto\.subtle\.sign\('HMAC'/);
  const verifyAt = edgeWebhook.indexOf("if(!(await verify(raw,sig,secret)))");
  const parseAt = edgeWebhook.indexOf('JSON.parse(raw)');
  const classifyAt = edgeWebhook.indexOf('classification=await classifyDabbir(evt)');
  assert.ok(verifyAt > 0 && parseAt > verifyAt && classifyAt > parseAt);
});

test('live non-DABBIR invoice events bypass DABBIR sandbox lookup before legacy routing', () => {
  const invoiceAt=edgeWebhook.indexOf("if(evt.type==='invoice.paid'||evt.type==='invoice.payment_failed')");
  const liveBypassAt=edgeWebhook.indexOf("if(evt.livemode===true)return {yes:false,obj,subscription:null}",invoiceAt);
  const stripeLookupAt=edgeWebhook.indexOf('const subscription=await stripeGet',invoiceAt);
  assert.ok(invoiceAt>0&&liveBypassAt>invoiceAt&&stripeLookupAt>liveBypassAt);
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

test('subscription truth is DABBIR-metadata scoped and webhook-driven with no card storage', () => {
  assert.doesNotMatch(migration, /card_number|card_cvc|payment_method_details|client_secret/i);
  assert.match(edgeWebhook, /isDabbirMetadata/);
  assert.match(edgeWebhook, /checkout\.session\.completed/);
  assert.match(edgeWebhook, /customer\.subscription\./);
  assert.match(edgeWebhook, /invoice\.paid/);
  assert.match(edgeWebhook, /invoice\.payment_failed/);
  assert.match(edgeWebhook, /dabbir_stripe_events/);
  assert.match(edgeWebhook, /onConflict:'business_id'/);
  assert.match(edgeWebhook, /onConflict:'stripe_event_id'/);
});

test('legacy ZAJEL Stripe behavior stays outside the DABBIR bridge branch', () => {
  const bridgeAt=edgeCheckout.indexOf("if(req.headers.get('x-dabbir-billing-bridge')==='v1')");
  const zajelAt=edgeCheckout.indexOf("p_project_key:'ZAJEL'");
  assert.ok(bridgeAt>0&&zajelAt>bridgeAt);
  assert.match(edgeCheckout, /PAYMENT_LIVE_NOT_APPROVED/);
  assert.match(edgeCheckout, /barman_get_sellable_product/);
  assert.match(edgeWebhook, /barman_record_stripe_checkout/);
  assert.match(edgeWebhook, /barman_update_stripe_payment_intent/);
});

test('Vercel has no competing billing webhook handler', async () => {
  await assert.rejects(access(new URL('../api/billing/webhook.js', import.meta.url)));
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
