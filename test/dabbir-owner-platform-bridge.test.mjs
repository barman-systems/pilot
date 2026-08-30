import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [bridge,actionBridge,ui,gateway,migration]=await Promise.all([
  read('api/owner-platform-bridge.js'),
  read('api/owner-action-bridge.js'),
  read('api/owner-command-center-v9.js'),
  read('api/owner-dashboard-gateway.js'),
  read('supabase/migrations/20260830100400_dabbir_platform_owner_action_bridge_v1.sql'),
]);

test('owner platform read bridge stays owner-session gated and read only',()=>{
  assert.match(bridge,/__Host-dabbir_owner_session/);
  assert.match(bridge,/owner_session_verify/);
  assert.match(bridge,/role==='platform_owner'/);
  assert.match(bridge,/req\.method!=='GET'/);
  assert.doesNotMatch(ui,/SUPABASE_SERVICE_ROLE_KEY/);
});

test('owner action bridge requires OTP session same origin reason and explicit confirmation',()=>{
  assert.match(actionBridge,/__Host-dabbir_owner_session/);
  assert.match(actionBridge,/owner_session_verify/);
  assert.match(actionBridge,/role==='platform_owner'/);
  assert.match(actionBridge,/requireSameOrigin/);
  assert.match(actionBridge,/REASON_REQUIRED/);
  assert.match(actionBridge,/confirmation!=='EXECUTE'/);
  assert.match(actionBridge,/set_inventory/);
  assert.match(actionBridge,/set_product_active/);
  assert.match(actionBridge,/cancel_pending_order/);
  assert.doesNotMatch(actionBridge,/refund|checkout|disconnect|access_token_ciphertext/);
});

test('database action function is service-role only and audited atomically',()=>{
  assert.match(migration,/security definer/);
  assert.match(migration,/revoke all on function public\.dabbir_platform_owner_action_v1[\s\S]*public,anon,authenticated/);
  assert.match(migration,/grant execute[\s\S]*service_role/);
  assert.match(migration,/dabbir_platform_owner_audit/);
  assert.match(migration,/for update/);
  assert.match(migration,/ORDER_NOT_CANCELLABLE/);
  assert.doesNotMatch(migration,/stripe|whatsapp|refund/);
});

test('v9 command center exposes audited actions and real audit history',()=>{
  assert.match(ui,/\/api\/owner-action-bridge/);
  assert.match(ui,/Owner Action Bridge/);
  assert.match(ui,/EXECUTE/);
  assert.match(ui,/سجل التدقيق/);
  assert.match(gateway,/owner-command-center-v9\.js/);
});
