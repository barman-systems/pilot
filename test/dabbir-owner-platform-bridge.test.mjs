import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [bridge,actionBridge,ui10,ui11,gateway,migration,searchMigration]=await Promise.all([
  read('api/owner-platform-bridge.js'),
  read('api/owner-action-bridge.js'),
  read('api/owner-command-center-v10.js'),
  read('api/owner-command-center-v11.js'),
  read('api/owner-dashboard-gateway.js'),
  read('supabase/migrations/20260830102000_dabbir_platform_owner_action_bridge_v2.sql'),
  read('supabase/migrations/20260827155045_dabbir_platform_customer_search_escape_fix_v3.sql'),
]);

test('owner platform read bridge stays owner-session gated and read only',()=>{
  assert.match(bridge,/__Host-dabbir_owner_session/);assert.match(bridge,/owner_session_verify/);assert.match(bridge,/role==='platform_owner'/);assert.match(bridge,/req\.method!=='GET'/);assert.doesNotMatch(ui11,/SUPABASE_SERVICE_ROLE_KEY/);
});

test('owner action bridge is explicitly allowlisted and confirmed',()=>{
  assert.match(actionBridge,/requireSameOrigin/);assert.match(actionBridge,/confirmation!=='EXECUTE'/);assert.match(actionBridge,/REASON_REQUIRED/);
  for(const action of ['set_inventory','set_product_active','cancel_pending_order','set_service_active','support_create_case','support_add_note','support_set_status'])assert.match(actionBridge,new RegExp(action));
  assert.doesNotMatch(actionBridge,/create_expense|refund|checkout|disconnect|set_member_role|access_token_ciphertext/);
});

test('database action function is service-role only and audited atomically',()=>{
  assert.match(migration,/security definer/);assert.match(migration,/revoke all on function public\.dabbir_platform_owner_action_v1[\s\S]*public,anon,authenticated/);assert.match(migration,/grant execute[\s\S]*service_role/);assert.match(migration,/dabbir_platform_owner_audit/);assert.match(migration,/for update/);assert.match(migration,/ORDER_NOT_CANCELLABLE/);assert.match(migration,/platform_customer_support_notes/);assert.doesNotMatch(migration,/stripe|refund|create_expense|set_member_role/);
});

test('v11 inherits v10 audited controls and repairs customer result contract',()=>{
  for(const action of ['set_service_active','support_create_case','support_add_note','support_set_status'])assert.match(ui10,new RegExp(action));
  assert.match(ui11,/owner-command-center-v10\.js/);assert.match(ui11,/Array\.isArray\(p\.accounts\)/);assert.match(ui11,/customer_no/);assert.match(ui11,/businesses/);assert.match(ui11,/data-biz/);assert.match(ui11,/owner-dashboard-data\?action=search/);assert.match(gateway,/owner-command-center-v11\.js/);
  assert.match(searchMigration,/jsonb_build_object\('accounts',v_result,'count',v_count\)/);
});
