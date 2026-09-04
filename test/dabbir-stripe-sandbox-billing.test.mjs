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
const [core, checkout, trial, portal, edgeCheckout, edgeWebhook, ui, shell, migration, trialMigration, contract] = await Promise.all([
  read('api/_billing-core.js'),
  read('api/billing/checkout.js'),
  read('api/billing/trial.js'),
  read('api/billing/portal.js'),
  read('supabase/functions/barman-stripe-checkout/index.ts'),
  read('supabase/functions/barman-stripe-webhook/index.ts'),
  read('api/dabbir-billing-ui.js'),
  read('api/app-recovery.js'),
  read('supabase/migrations/20260827181057_dabbir_stripe_sandbox_billing_v1.sql'),
  read('supabase/migrations/20260905010500_dabbir_owner_no_card_trial_v1.sql'),
  read('scripts/dabbir-stripe-sandbox-contract.mjs'),
]);

test('DABBIR owner plan is server-fixed to 299 AED monthly and a 14-day app-side no-card trial', () => {
  assert.equal(DABBIR_OWNER_PRICE_ID, 'price_1UC4GNPxQ9s8ILDGU8LTapgz');
  assert.equal(DABBIR_OWNER_MONTHLY_AED, 299);
  assert.equal(DABBIR_TRIAL_DAYS, 14);
  assert.match(edgeCheckout, /DABBIR_PRICE_ID='price_1UC4GNPxQ9s8ILDGU8LTapgz'/);
  assert.match(edgeCheckout, /line_items\[0\]\[price\].*DABBIR_PRICE_ID/s);
  assert.doesNotMatch(edgeCheckout, /trial_period_days/);
  assert.doesNotMatch(checkout, /body\?\.price|body\.price|price_id.*body/i);
  assert.doesNotMatch(edgeCheckout, /automatic_tax/);
  assert.match(contract, /monthly_aed:\s*299/);
  assert.match(contract, /trial_days:\s*14/);
  assert.match(contract, /trial_model:\s*'dabbir_app_no_card'/);
  assert.match(contract, /stripe_trial_period_days:\s*0/);
});

test('no-card trial is owner-only, same-origin, service-role-only and one-time', () => {
  assert.match(trial, /requireSameOrigin\(req\)/);
  assert.match(trial, /requireBillingOwner\(req/);
  assert.match(trial, /startBillingTrial\(context\.businessId\)/);
  assert.doesNotMatch(trial, /stripeSandboxBridge|api\.stripe\.com|payment_method/i);
  assert.match(trialMigration, /interval '14 days'/i);
  assert.match(trialMigration, /security definer/i);
  assert.match(trialMigration, /revoke all on function public\.dabbir_start_owner_trial_v1\(uuid\) from public, anon, authenticated/i);
  assert.match(trialMigration, /grant execute on function public\.dabbir_start_owner_trial_v1\(uuid\) to service_role/i);
  assert.match(trialMigration, /trial_started_at is not null or v_row\.trial_ends_at is not null/i);
  assert.doesNotMatch(trialMigration, /stripe_customer_id\s*=|stripe_subscription_id\s*=|payment_method/i);
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

test('billing mutations are same-origin, owner-only, and bridge calls are server-authenticated without requiring opaque API keys to be JWTs', () => {
  assert.match(checkout, /requireSameOrigin\(req\)/);
  assert.match(portal, /requireSameOrigin\(req\)/);
  assert.match(core, /membership\.role\|\|''\)\.toLowerCase\(\)!=='owner'/);
  assert.match(core, /OWNER_APPROVAL_REQUIRED/);
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

test('public billing state derives app trial lifecycle deterministically', () => {
  assert.equal(safeBusinessId('11111111-1111-4111-8111-111111111111'), '11111111-1111-4111-8111-111111111111');
  assert.equal(safeBusinessId('not-a-uuid'), null);
  assert.equal(checkoutIdempotencyKey('b', 'u', 0), checkoutIdempotencyKey('b', 'u', 599999));
  assert.notEqual(checkoutIdempotencyKey('b', 'u', 0), checkoutIdempotencyKey('b', 'u', 600000));
  assert.equal(requestOrigin({ headers: { host: 'app.example.com', 'x-forwarded-proto': 'http' } }), 'https://app.example.com');
  assert.throws(() => requestOrigin({ headers: { host: 'bad host' } }), /INVALID_REQUEST_HOST/);
  assert.deepEqual(publicBillingState(null), {
    plan: 'owner', status: 'not_subscribed', amount: 299, currency: 'AED', interval: 'month',
    trial_days: 14, trial_available: true, can_subscribe: false, can_manage: false,
  });
  const trialing=publicBillingState({status:'trialing',trial_started_at:'2026-09-01T00:00:00Z',trial_ends_at:'2026-09-15T00:00:00Z',stripe_customer_id:null,stripe_subscription_id:null},Date.parse('2026-09-05T00:00:00Z'));
  assert.equal(trialing.status,'trialing');
  assert.equal(trialing.can_subscribe,true);
  assert.equal(trialing.can_manage,false);
  const expired=publicBillingState({status:'trialing',trial_started_at:'2026-08-01T00:00:00Z',trial_ends_at:'2026-08-15T00:00:00Z',stripe_customer_id:null,stripe_subscription_id:null},Date.parse('2026-09-05T00:00:00Z'));
  assert.equal(expired.status,'trial_expired');
  assert.equal(expired.can_subscribe,true);
});

test('billing UI exposes no-card trial, subscription checkout and portal without secrets', () => {
  const billingAt = shell.indexOf('/api/dabbir-billing-ui');
  const metricsAt = shell.indexOf('/api/verified-metrics-ui');
  assert.ok(billingAt > 0 && metricsAt > billingAt);
  assert.match(ui, /299 د\.إ شهريًا/);
  assert.match(ui, /14 يومًا مجانًا بلا بطاقة/);
  assert.match(ui, /\/api\/billing\/trial/);
  assert.match(ui, /\/api\/billing\/status/);
  assert.match(ui, /\/api\/billing\/checkout/);
  assert.match(ui, /\/api\/billing\/portal/);
  assert.match(ui, /Stripe Sandbox فقط/);
  assert.match(ui, /Stripe Sandbox only/);
  assert.doesNotMatch(ui, /sk_test_|sk_live_|SUPABASE_SERVICE_ROLE_KEY/);
});
