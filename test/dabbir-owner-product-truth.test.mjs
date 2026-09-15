import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderOwnerCommandCenter } from '../api/owner-command-center.js';
import { normalizeProductTruthForUi } from '../api/owner-dashboard-data.js';

test('product truth is part of the canonical owner dashboard for root owner only',()=>{
  const root=renderOwnerCommandCenter({authority_role:'ROOT_OWNER'},'ar');
  assert.match(root,/id="productTruthPanel"/);
  assert.match(root,/حقيقة المنتج/);
  assert.match(root,/owner-dashboard-data\?action=product_truth/);
  assert.equal((root.match(/<script>/g)||[]).length,1);

  const delegated=renderOwnerCommandCenter({authority_role:'OWNER_DELEGATE'},'ar');
  assert.doesNotMatch(delegated,/id="productTruthPanel"/);
  assert.equal((delegated.match(/<script>/g)||[]).length,1);
});

test('product truth normalization keeps missing measurement distinct from zero',()=>{
  const normalized=normalizeProductTruthForUi({
    authority:'DABBIR_OPERATIONAL_TRUTH',
    measurement_state:'COMPLETE',
    signup_accounts:5,
    returning_users:2,
    businesses_created:3,
    first_requests:1,
    first_actions:0,
    posthog_delivery:{state:'SYNCING',total:7,delivered:5,pending:2,failed:0},
    activity_breakdown:[{business_type:'car_wash',businesses_created:2,first_requests:1,first_actions:0}]
  });
  assert.equal(normalized.authority,'DABBIR_OPERATIONAL_TRUTH');
  assert.equal(normalized.signup_accounts,5);
  assert.equal(normalized.first_actions,0);
  assert.equal(normalized.posthog_delivery.state,'SYNCING');
  assert.equal(normalized.activity_breakdown[0].business_type,'car_wash');

  const missing=normalizeProductTruthForUi({});
  assert.equal(missing.signup_accounts,null);
  assert.equal(missing.first_requests,null);
  assert.equal(missing.posthog_delivery.total,null);
  assert.equal(missing.posthog_delivery.state,'UNKNOWN');
});

test('owner product truth RPC remains root-only and PostHog remains secondary',()=>{
  const api=fs.readFileSync(new URL('../api/owner-dashboard-data.js',import.meta.url),'utf8');
  const snapshot=fs.readFileSync(new URL('../supabase/migrations/20260915020500_dabbir_owner_product_truth_snapshot_v1.sql',import.meta.url),'utf8');
  const outbox=fs.readFileSync(new URL('../supabase/migrations/20260915020000_dabbir_posthog_product_outbox_v1.sql',import.meta.url),'utf8');
  assert.match(api,/action==='product_truth'/);
  assert.match(api,/ROOT_OWNER_REQUIRED/);
  assert.match(snapshot,/DABBIR_OPERATIONAL_TRUTH/);
  assert.match(snapshot,/revoke all on function public\.dabbir_platform_product_truth_snapshot_v1\(\) from public,anon,authenticated/i);
  assert.match(outbox,/DABBIR operational tables remain authoritative/i);
  assert.match(outbox,/\$process_person_profile',false/);
});
