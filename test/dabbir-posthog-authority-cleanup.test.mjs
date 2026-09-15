import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('synthetic PostHog health endpoint stays retired', () => {
  assert.equal(
    fs.existsSync(new URL('../api/posthog-health.js', import.meta.url)),
    false,
    'PostHog health must come from the durable DABBIR outbox, not a synthetic capture endpoint',
  );
});

test('public product analytics writer stays server-only', () => {
  const source = read('api/product-analytics.js');
  assert.match(source, /ANALYTICS_SERVER_ONLY/);
  assert.doesNotMatch(source, /POSTHOG_PROJECT_TOKEN|POSTHOG_HOST|\/capture\//);
});

test('owner Product Truth keeps PostHog secondary to DABBIR operational truth', () => {
  const owner = read('api/owner-dashboard-data.js');
  const snapshot = read('supabase/migrations/20260915020500_dabbir_owner_product_truth_snapshot_v1.sql');
  const outbox = read('supabase/migrations/20260915020000_dabbir_posthog_product_outbox_v1.sql');
  assert.match(owner, /action==='product_truth'/);
  assert.match(snapshot, /DABBIR_OPERATIONAL_TRUTH/);
  assert.match(snapshot, /posthog_delivery/);
  assert.match(outbox, /source','dabbir_server_truth'/);
});
