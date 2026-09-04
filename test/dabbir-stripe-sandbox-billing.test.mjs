import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import {
  DABBIR_OWNER_MONTHLY_AED,
  DABBIR_OWNER_MONTHLY_MINOR,
  DABBIR_OWNER_PLAN_CODE,
  DABBIR_TRIAL_DAYS,
  checkoutIdempotencyKey,
  publicBillingState,
  requestOrigin,
  safeBusinessId,
} from '../api/_billing-core.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const [core, checkout, portal, edgeCheckout, edgeWebhook, ui, shell, migration, planMigration] = await Promise.all([
  read('api/_billing-core.js'),
  read('api/billing/checkout.js'),
  read('api/billing/portal.js'),
  read('supabase/functions/barman-stripe-checkout/index.ts'),
  read('supabase/functions/barman-stripe-webhook/index.ts'),
  read('api/dabbir-billing-ui.js'),
  read('api/app-recovery.js'),
  read('supabase/migrations/20260827181057_dabbir_stripe_sandbox_billing_v1.sql'),
  read('supabase/migrations/20260905003000_dabbir_subscription_catalog_v1.sql'),
]);

test('DABBIR owner plan is server-fixed to AED 29.99 monthly and a 14-day trial', () => {
  assert.equal(DABBIR_OWNER_PLAN_CODE, 'owner_monthly_v1');
  assert.equal(DABBIR_OWNER_MONTHLY_AED, 29.99);
  assert.equal(DABBIR_OWNER_MONTHLY_MINOR, 2999);
  assert.equal(DABBIR_TRIAL_DAYS, 14);
  assert.match(edgeCheckout, /DABBIR_PLAN_CODE='owner_monthly_v1'/);
  assert.match(edgeCheckout, /DABBIR_AMOUNT_MINOR=2999/);
  assert.match(edgeCheckout, /DABBIR_TRIAL_DAYS=14/);
  assert.match(edgeCheckout, /billingPlan\(\)/);
  assert.match(edgeCheckout, /verifiedStripePrice/);
  assert.match(edgeCheckout, /line_items\[0\]\[price\].*plan\.stripe_test_price_id/s);
  assert.match(edgeCheckout, /trial_available===true.*trial_period_days.*plan\.trial_days/s);
  assert.doesNotMatch(edgeCheckout, /price_1U8yRWLYIkiZam7bHaP2NhtT/);
  assert.doesNotMatch(checkout, /body\?\.price|body\.price|price_id.*body/i);
  assert.doesNotMatch(edgeCheckout, /automatic_tax/);
});

test('subscription catalog is server-only and seeded fail-closed until the verified Stripe test price is attached', () => {
  assert.match(planMigration, /create table if not exists public\.dabbir_billing_plans/i);
  assert.match(planMigration, /'owner_monthly_v1'.*2999.*'AED'.*'month'.*14/s);
  assert.match(planMigration, /stripe_test_price_id, stripe_live_price_id, active/s);
  assert.match(planMigration, /null, null, true/s);
  assert.match(planMigration, /force row level security/i);
  assert.match(planMigration, /revoke all on table public\.dabbir_billing_plans from public, anon, authenticated/i);
  assert.match(planMigration, /grant select, insert, update, delete on table public\.dabbir_billing_plans to service_role/i);
  assert.match(edgeCheckout, /BILLING_PRICE_NOT_CONFIGURED/);
  assert.match(edgeCheckout, /BILLING_PRICE_CONTRACT_MISMATCH/);
});

test('Stripe execution is isolated in Supabase and DABBIR rejects live or malformed keys', () => {
  assert.doesNotMatch(core, /process\.env\.STRIPE_SECRET_KEY|api\.stripe\.com/);
  assert.match(core, /functions\/v1\/barman-stripe-checkout/);
  assert.match(core, /x-dabbir-billing-bridge':'v1'/);
  assert.match(core, /supabaseKeyHeaders/);
  assert.match(edgeCheckout, /key\.startsWith\('sk_live_'\).*LIVE_BILLING_DISABLED/s);
  assert.match(edgeCheckout, /!key\.startsWith\('sk_test_'\).*INVALID_STRIPE_SANDBOX_KEY/s);
  assert.match(edgeWebhook, /key\.startsWith\('sk_live_'\).*LIVE_BILLING_DISABLED/s);
  assert.match(edgeWebhook, /!key\.startsWith\('sk_test_'\).*INVALID_STRIPE_SANDBOX_KEY/s);
});

test('billing mutations are same-origin, owner-only, and checkout plan is server-bound', () => {
  assert.match(checkout, /requireSameOrigin\(req\)/);
  assert.match(portal, /requireSameOrigin\(req\)/);
  assert.match(core, /membership\.role\|\|''\)\.toLowerCase\(\)!=='owner'/);
  assert.match(core, /OWNER_APPROVAL_REQUIRED/);
  assert.match(checkout, /plan_code:DABBIR_OWNER_PLAN_CODE/);
  assert.match(edgeCheckout, /INVALID_PLAN_CODE/);
  assert.match(edgeCheckout, /apiKey===expected/);
  assert.match(edgeCheckout, /legacyJwt&&auth===`Bearer \$\{expected\}`/);
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

test('webhook accepts only the configured DABBIR plan and verified Stripe price', () => {
  assert.match(edgeWebhook, /plan_code\|\|''\).*DABBIR_PLAN_CODE/s);
  assert.match(edgeWebhook, /billingPlan\(\)/);
  assert.match(edgeWebhook, /priceId!==plan\.stripe_test_price_id/);
  assert.match(edgeWebhook, /DABBIR_SUBSCRIPTION_PRICE_MISMATCH/);
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
  assert.doesNotMatch(migration + planMigration, /card_number|card_cvc|payment_method_details|client_secret/i);
  assert.match(edgeWebhook, /isDabbirMetadata/);
  assert.match(edgeWebhook, /checkout\.session\.completed/);
  assert.match(edgeWebhook, /customer\.subscription\./);
  assert.match(edgeWebhook, /invoice\.paid/);
  assert.match(edgeWebhook, /invoice\.payment_failed/);
  assert.match(edgeWebhook, /dabbir_stripe_events/);
  assert.match(edgeWebhook, /onConflict:'business_id'/);
  assert.match(edgeWebhook, /onConflict:'stripe_event_id'/);
});

test('legacy ZAJEL checkout stays explicitly stopped outside the DABBIR bridge', () => {
  const bridgeAt=edgeCheckout.indexOf("if(req.headers.get('x-dabbir-billing-bridge')==='v1')");
  const stoppedAt=edgeCheckout.indexOf('LEGACY_BILLING_DISABLED');
  assert.ok(bridgeAt>0&&stoppedAt>bridgeAt);
  assert.match(edgeCheckout, /system:'BARMAN_ZAJEL'/);
  assert.doesNotMatch(edgeCheckout, /p_project_key:'ZAJEL'|barman_get_sellable_product/);
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
    plan: 'owner', plan_code: 'owner_monthly_v1', amount: 29.99, amount_minor: 2999,
    currency: 'AED', interval: 'month', trial_days: 14, mode: 'sandbox',
    status: 'not_subscribed', trial_available: true, can_subscribe: true, can_manage: false,
  });
});

test('billing UI is mounted on the authoritative shell and exposes the 29.99 AED subscription', () => {
  const billingAt = shell.indexOf('/api/dabbir-billing-ui');
  const metricsAt = shell.indexOf('/api/verified-metrics-ui');
  assert.ok(billingAt > 0 && metricsAt > billingAt);
  assert.match(ui, /29\.99/);
  assert.match(ui, /14 يومًا/);
  assert.match(ui, /14-day full trial/);
  assert.match(ui, /Stripe Sandbox فقط/);
  assert.match(ui, /Stripe Sandbox only/);
  assert.match(ui, /\/api\/billing\/status/);
  assert.match(ui, /\/api\/billing\/checkout/);
  assert.match(ui, /\/api\/billing\/portal/);
  assert.doesNotMatch(ui, /sk_test_|sk_live_|SUPABASE_SERVICE_ROLE_KEY/);
});
