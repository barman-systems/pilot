import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeAiUsageForUi } from '../api/owner-dashboard-data.js';

const ui=fs.readFileSync(new URL('../api/owner-command-center.js',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../api/owner-dashboard-data.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260909032306_owner_ai_usage_dashboard_v1.sql',import.meta.url),'utf8');

test('AI usage normalization preserves unknown values instead of inventing zero cost',()=>{
  const value=normalizeAiUsageForUi({measurement_state:'PARTIAL',conversations:3,messages:173,unpriced_operations:24,known_cost_aed:null,providers:[{provider:'groq',ai_requests:2,known_cost_aed:null,unpriced_operations:1}]});
  assert.equal(value.measurement_state,'PARTIAL');
  assert.equal(value.conversations,3);
  assert.equal(value.known_cost_aed,null);
  assert.equal(value.providers[0].known_cost_aed,null);
  assert.equal(value.unpriced_operations,24);
});

test('root owner dashboard requests and renders monthly AI conversations and spend',()=>{
  assert.match(ui,/id="aiUsagePanel"/);
  assert.match(ui,/dataUrl\('ai_usage'\)/);
  assert.match(ui,/authority_role==='ROOT_OWNER'/);
  assert.match(ui,/unpriced AI operations/);
  assert.match(ui,/Confirmed spend/);
  assert.match(ui,/WhatsApp avg \/ conversation/);
});

test('AI usage API is root-gated and database aggregate is service-role only',()=>{
  assert.match(api,/action==='ai_usage'/);
  assert.match(api,/authority_role!=='ROOT_OWNER'/);
  assert.match(api,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(migration,/dabbir_platform_ai_usage_snapshot_v1/);
  assert.match(migration,/count\(distinct m\.conversation_id\)/);
  assert.match(migration,/dabbir_ai_customer_cost_monthly_v1/);
  assert.match(migration,/revoke all on function public\.dabbir_platform_ai_usage_snapshot_v1\(\) from public, anon, authenticated/i);
  assert.match(migration,/grant execute on function public\.dabbir_platform_ai_usage_snapshot_v1\(\) to service_role/i);
});
