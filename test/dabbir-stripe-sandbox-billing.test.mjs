import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import {
  DABBIR_OWNER_MONTHLY_AED,
  DABBIR_OWNER_MONTHLY_MINOR,
  DABBIR_EXTRA_BUSINESS_MONTHLY_AED,
  DABBIR_EXTRA_BUSINESS_MONTHLY_MINOR,
  DABBIR_EXTRA_BRANCH_MONTHLY_AED,
  DABBIR_EXTRA_BRANCH_MONTHLY_MINOR,
  DABBIR_OWNER_PLAN_CODE,
  DABBIR_EXTRA_BUSINESS_PLAN_CODE,
  DABBIR_EXTRA_BRANCH_PLAN_CODE,
  DABBIR_TRIAL_DAYS,
  billingRootBusinessId,
  checkoutIdempotencyKey,
  ownerMemberships,
  publicBillingState,
  requestOrigin,
  safeBusinessId,
} from '../api/_billing-core.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const [core, checkout, portal, edgeCheckout, edgeWebhook, ui, shell, migration, planMigration, contract] = await Promise.all([
  read('api/_billing-core.js'), read('api/billing/checkout.js'), read('api/billing/portal.js'),
  read('supabase/functions/barman-stripe-checkout/index.ts'), read('supabase/functions/barman-stripe-webhook/index.ts'),
  read('api/dabbir-billing-ui.js'), read('api/app-recovery.js'),
  read('supabase/migrations/20260827181057_dabbir_stripe_sandbox_billing_v1.sql'),
  read('supabase/migrations/20260905003000_dabbir_subscription_catalog_v1.sql'),
  read('scripts/dabbir-stripe-sandbox-contract.mjs'),
]);

test('DABBIR subscription pricing is fixed to 39.99 base + 29.99 business + 19.99 branch', () => {
  assert.equal(DABBIR_OWNER_PLAN_CODE, 'owner_monthly_v1');
  assert.equal(DABBIR_EXTRA_BUSINESS_PLAN_CODE, 'owner_extra_business_v1');
  assert.equal(DABBIR_EXTRA_BRANCH_PLAN_CODE, 'owner_extra_branch_v1');
  assert.equal(DABBIR_OWNER_MONTHLY_AED, 39.99); assert.equal(DABBIR_OWNER_MONTHLY_MINOR, 3999);
  assert.equal(DABBIR_EXTRA_BUSINESS_MONTHLY_AED, 29.99); assert.equal(DABBIR_EXTRA_BUSINESS_MONTHLY_MINOR, 2999);
  assert.equal(DABBIR_EXTRA_BRANCH_MONTHLY_AED, 19.99); assert.equal(DABBIR_EXTRA_BRANCH_MONTHLY_MINOR, 1999);
  assert.equal(DABBIR_TRIAL_DAYS, 14);
  assert.match(contract, /base_monthly_aed: 39\.99/);
  assert.match(contract, /extra_business_monthly_aed: 29\.99/);
  assert.match(contract, /extra_branch_monthly_aed: 19\.99/);
});

test('billing root is deterministic and additional activities are owner-only', () => {
  const memberships=[
    {business_id:'22222222-2222-4222-8222-222222222222',role:'owner',status:'active',accepted_at:'2026-02-01T00:00:00Z'},
    {business_id:'11111111-1111-4111-8111-111111111111',role:'owner',status:'active',accepted_at:'2026-01-01T00:00:00Z'},
    {business_id:'33333333-3333-4333-8333-333333333333',role:'staff',status:'active',accepted_at:'2025-01-01T00:00:00Z'},
  ];
  assert.equal(ownerMemberships(memberships).length,2);
  assert.equal(billingRootBusinessId(memberships),'11111111-1111-4111-8111-111111111111');
});

test('server catalog contains all three monthly prices and fails closed until verified Stripe test prices are attached', () => {
  assert.match(planMigration, /'owner_monthly_v1'.*3999.*'AED'.*'month'.*14/s);
  assert.match(planMigration, /'owner_extra_business_v1'.*2999.*'AED'.*'month'.*0/s);
  assert.match(planMigration, /'owner_extra_branch_v1'.*1999.*'AED'.*'month'.*0/s);
  assert.match(planMigration, /null, null, true/s);
  assert.match(planMigration, /force row level security/i);
  assert.match(planMigration, /revoke all on table public\.dabbir_billing_plans from public, anon, authenticated/i);
  assert.match(edgeCheckout, /BILLING_PRICE_NOT_CONFIGURED/);
  assert.match(edgeCheckout, /BILLING_PRICE_CONTRACT_MISMATCH/);
  assert.match(edgeCheckout, /PLAN_CODES/);
});

test('checkout quantities are derived server-side from owner businesses and active non-primary branches', () => {
  assert.match(edgeCheckout, /dabbir_memberships/);
  assert.match(edgeCheckout, /\.eq\('role','owner'\)/);
  assert.match(edgeCheckout, /dabbir_business_branches/);
  assert.match(edgeCheckout, /\.eq\('is_primary',false\)/);
  assert.match(edgeCheckout, /additionalBusinesses=Math\.max\(0,ids\.length-1\)/);
  assert.match(edgeCheckout, /BASE_MINOR\+\(additionalBusinesses\*BUSINESS_MINOR\)\+\(additionalBranches\*BRANCH_MINOR\)/);
  assert.match(edgeCheckout, /line_items\[/);
  assert.match(edgeCheckout, /BUSINESS_PLAN/);
  assert.match(edgeCheckout, /BRANCH_PLAN/);
  assert.doesNotMatch(checkout, /body\?\.price|body\.price|price_id.*body/i);
});

test('Stripe execution stays isolated in Supabase and live or malformed keys are rejected', () => {
  assert.doesNotMatch(core, /process\.env\.STRIPE_SECRET_KEY|api\.stripe\.com/);
  assert.match(core, /functions\/v1\/barman-stripe-checkout/);
  assert.match(core, /x-dabbir-billing-bridge':'v1'/);
  assert.match(edgeCheckout, /key\.startsWith\('sk_live_'\).*LIVE_BILLING_DISABLED/s);
  assert.match(edgeCheckout, /!key\.startsWith\('sk_test_'\).*INVALID_STRIPE_SANDBOX_KEY/s);
  assert.match(edgeWebhook, /key\.startsWith\('sk_live_'\).*LIVE_BILLING_DISABLED/s);
});

test('billing mutations are same-origin and owner-only', () => {
  assert.match(checkout, /requireSameOrigin\(req\)/); assert.match(portal, /requireSameOrigin\(req\)/);
  assert.match(core, /membership\.role\|\|''\)\.toLowerCase\(\)!=='owner'/);
  assert.match(core, /OWNER_APPROVAL_REQUIRED/);
  assert.match(checkout, /billing_root_business_id:context\.billingRootBusinessId/);
  assert.match(edgeCheckout, /BILLING_ROOT_MISMATCH/);
  assert.match(edgeCheckout, /x-dabbir-billing-bridge.*==='v1'/);
});

test('webhook verifies signature before parsing and accepts only the three allowed DABBIR prices', () => {
  assert.match(edgeWebhook, /Math\.abs\(Date\.now\(\)\/1000-ts\)>300/);
  assert.match(edgeWebhook, /crypto\.subtle\.sign\('HMAC'/);
  const verifyAt=edgeWebhook.indexOf("if(!(await verify(raw,sig,secret)))");
  const parseAt=edgeWebhook.indexOf('JSON.parse(raw)');
  assert.ok(verifyAt>0&&parseAt>verifyAt);
  assert.match(edgeWebhook, /DABBIR_SUBSCRIPTION_PRICE_MISMATCH/);
  assert.match(edgeWebhook, /DABBIR_BASE_PLAN_REQUIRED/);
  assert.match(edgeWebhook, /DABBIR_PRICING_METADATA_MISMATCH/);
  assert.match(edgeWebhook, /additional_businesses:pricing\.extraBusinesses/);
  assert.match(edgeWebhook, /additional_branches:pricing\.extraBranches/);
});

test('billing state mirrors portfolio pricing without storing card data', () => {
  assert.match(planMigration, /additional_businesses integer/);
  assert.match(planMigration, /additional_branches integer/);
  assert.match(planMigration, /monthly_amount_minor integer/);
  assert.match(planMigration, /pricing_snapshot jsonb/);
  assert.doesNotMatch(migration+planMigration, /card_number|card_cvc|payment_method_details|client_secret/i);
  assert.match(edgeWebhook, /dabbir_stripe_events/);
  assert.match(edgeWebhook, /onConflict:'business_id'/);
  assert.match(edgeWebhook, /onConflict:'stripe_event_id'/);
});

test('legacy ZAJEL checkout stays explicitly stopped outside the DABBIR bridge', () => {
  const bridgeAt=edgeCheckout.indexOf("if(req.headers.get('x-dabbir-billing-bridge')==='v1')");
  const stoppedAt=edgeCheckout.indexOf('LEGACY_BILLING_DISABLED');
  assert.ok(bridgeAt>0&&stoppedAt>bridgeAt);
  assert.match(edgeCheckout, /system:'BARMAN_ZAJEL'/);
});

test('Vercel has no competing billing webhook handler', async () => {
  await assert.rejects(access(new URL('../api/billing/webhook.js', import.meta.url)));
});

test('public billing state and identifiers stay deterministic', () => {
  assert.equal(safeBusinessId('11111111-1111-4111-8111-111111111111'),'11111111-1111-4111-8111-111111111111');
  assert.equal(safeBusinessId('not-a-uuid'),null);
  assert.equal(checkoutIdempotencyKey('b','u',0,'x'),checkoutIdempotencyKey('b','u',599999,'x'));
  assert.notEqual(checkoutIdempotencyKey('b','u',0,'x'),checkoutIdempotencyKey('b','u',600000,'x'));
  assert.equal(requestOrigin({headers:{host:'app.example.com','x-forwarded-proto':'http'}}),'https://app.example.com');
  assert.throws(()=>requestOrigin({headers:{host:'bad host'}}),/INVALID_REQUEST_HOST/);
  const state=publicBillingState(null,{businesses:3,included_businesses:1,additional_businesses:2,additional_branches:4,total_minor:17993,total_aed:179.93});
  assert.equal(state.base_amount,39.99); assert.equal(state.additional_business_amount,29.99); assert.equal(state.additional_branch_amount,19.99);
  assert.equal(state.amount,179.93); assert.equal(state.status,'not_subscribed'); assert.equal(state.trial_available,true);
});

test('billing UI exposes approved pricing and the authoritative shell mounts it', () => {
  const billingAt=shell.indexOf('/api/dabbir-billing-ui');
  assert.ok(billingAt>0);
  assert.match(ui,/39\.99/); assert.match(ui,/29\.99/); assert.match(ui,/19\.99/); assert.match(ui,/14 يومًا/);
  assert.match(ui,/\/api\/billing\/status/); assert.match(ui,/\/api\/billing\/checkout/); assert.match(ui,/\/api\/billing\/portal/);
  assert.doesNotMatch(ui,/sk_test_|sk_live_|SUPABASE_SERVICE_ROLE_KEY/);
});
