import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [bridge,ui,gateway]=await Promise.all([
  read('api/owner-platform-bridge.js'),
  read('api/owner-command-center-v8.js'),
  read('api/owner-dashboard-gateway.js'),
]);

test('owner platform bridge is owner-session gated and read only',()=>{
  assert.match(bridge,/__Host-dabbir_owner_session/);
  assert.match(bridge,/owner_session_verify/);
  assert.match(bridge,/role==='platform_owner'/);
  assert.match(bridge,/req\.method!=='GET'/);
  assert.doesNotMatch(bridge,/method:'POST'[\s\S]*rest\(/);
  assert.match(bridge,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(ui,/SUPABASE_SERVICE_ROLE_KEY/);
});

test('bridge exposes only operational summaries and no provider secrets',()=>{
  assert.match(bridge,/dabbir_billing_accounts/);
  assert.match(bridge,/dabbir_whatsapp_connections/);
  assert.match(bridge,/dabbir_products/);
  assert.match(bridge,/dabbir_inventory/);
  assert.match(bridge,/dabbir_orders/);
  assert.doesNotMatch(bridge,/access_token_ciphertext|access_token_iv|access_token_tag/);
  assert.doesNotMatch(bridge,/stripe_customer_id|stripe_subscription_id/);
});

test('v8 command center consumes the owner platform bridge',()=>{
  assert.match(ui,/\/api\/owner-platform-bridge\?business_id=/);
  assert.match(ui,/قراءة مركزية فقط/);
  assert.match(ui,/لا تنفيذ مالي/);
  assert.match(gateway,/owner-command-center-v7\.js/);
});
