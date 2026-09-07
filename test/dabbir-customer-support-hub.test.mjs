import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [migration,permissionMigration,api,ui,staffApi,staffThreadUi,bundles,lazyLoader]=await Promise.all([
  read('supabase/migrations/20260907124500_dabbir_customer_support_hub_v1.sql'),
  read('supabase/migrations/20260907124600_dabbir_customer_support_hub_permission_v2.sql'),
  read('api/customer-support.js'),
  read('api/customer-support-ui.js'),
  read('api/platform-customer-support.js'),
  read('api/platform-customer-support-thread-ui.js'),
  read('config/dabbir-ui-bundles.json'),
  read('api/car-wash-loader-ui.js'),
]);

test('customer support keeps the ledger private and browser access server-mediated',()=>{
  assert.match(migration,/dabbir_private\.platform_customer_support_messages/);
  assert.match(migration,/force row level security/i);
  assert.match(migration,/platform_customer_support_messages_client_deny/);
  assert.match(migration,/to anon, authenticated[\s\S]*using \(false\)[\s\S]*with check \(false\)/i);
  for(const fn of ['dabbir_customer_support_summary','dabbir_customer_support_create','dabbir_customer_support_reply','dabbir_platform_support_reply_customer']){
    assert.match(migration,new RegExp(`function public\\.${fn}`));
  }
  assert.match(migration,/set search_path = ''/i);
  assert.doesNotMatch(migration,/grant execute on function public\.dabbir_customer_support_[^(]+\([^;]+to authenticated/i);
  assert.match(migration,/grant execute on function public\.dabbir_customer_support_summary\(uuid,uuid\) to service_role/i);
});

test('customer-facing cases are isolated from existing internal support notes',()=>{
  assert.match(migration,/customer_visible boolean not null default false/i);
  assert.match(migration,/origin text not null default 'staff'/i);
  assert.match(migration,/c\.target_user_id=p_actor_user_id[\s\S]*c\.customer_visible=true/i);
  assert.match(migration,/platform_customer_support_messages[\s\S]*author_kind/i);
  assert.doesNotMatch(migration,/dabbir_customer_support_summary[\s\S]{0,1600}platform_customer_support_notes/i);
});

test('customer ticket creation verifies business membership and emits a stable public reference',()=>{
  assert.match(migration,/m\.user_id=p_actor_user_id and m\.business_id=p_business_id and m\.status='active'/i);
  assert.match(migration,/customer_support_reference_seq/);
  assert.match(migration,/SUP-/);
  assert.match(migration,/true,'customer','in_app'/);
});

test('customer support API authenticates, requires same-origin writes, and only persists whitelisted context',()=>{
  assert.match(api,/accessTokenFromRequest/);
  assert.match(api,/getVerifiedUser/);
  assert.match(api,/requireSameOrigin\(req\)/);
  assert.match(api,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(api,/body\.action==='create'/);
  assert.match(api,/body\.action==='reply'/);
  assert.match(api,/screen:compact\(input\.screen/);
  assert.match(api,/pathname:compact\(input\.pathname/);
  assert.doesNotMatch(api,/password|secret_key|authorization:/i);
});

test('customer UI exposes in-app support, ticket status and optional official channels without hardcoded contact details',()=>{
  assert.match(ui,/دعم DABBIR/);
  assert.match(ui,/data-screen='support'|dataset\.screen='support'/);
  assert.match(ui,/\/api\/customer-support/);
  assert.match(ui,/SUP-|reference/);
  assert.match(ui,/واتساب الدعم/);
  assert.match(ui,/البريد الإلكتروني/);
  assert.match(ui,/طلب اتصال من الدعم/);
  assert.match(ui,/لا ترسل كلمات مرور أو مفاتيح سرية/);
  assert.doesNotMatch(ui,/971\d{7,}|@gmail\.com|@icloud\.com/i);
  assert.doesNotMatch(ui,/SUPABASE_SERVICE_ROLE_KEY/);
});

test('staff support can see and answer only customer-visible threads while internal notes remain separate',()=>{
  assert.match(staffApi,/body\.action==='reply_customer'/);
  assert.match(staffApi,/dabbir_platform_support_reply_customer/);
  assert.match(migration,/c\.customer_visible=true[\s\S]*DABBIR_SUPPORT_CASE_NOT_FOUND/i);
  assert.match(staffThreadUi,/customer_visible/);
  assert.match(staffThreadUi,/reply_customer/);
  assert.match(staffThreadUi,/محادثة مرئية للعميل/);
  assert.match(staffThreadUi,/\/api\/platform-customer-support/);
});

test('delegated platform staff must retain manage_support permission for summary and customer replies',()=>{
  assert.match(permissionMigration,/dabbir_platform_support_reply_customer/);
  assert.match(permissionMigration,/dabbir_platform_support_summary/);
  const gates=permissionMigration.match(/platform_assert_permission\(p_actor_user_id,'manage_support'\)/g)||[];
  assert.equal(gates.length,2);
  assert.doesNotMatch(permissionMigration,/platform_assert_admin\(p_actor_user_id\)/);
});

test('support UI reuses the existing shell slot and does not grow the frozen bundle',()=>{
  const config=JSON.parse(bundles);
  assert.equal(config.critical.length,3);
  assert.equal(config.deferred.length,23);
  assert.equal(config.critical.length+config.deferred.length,26);
  assert.ok(config.deferred.includes('/api/car-wash-loader-ui'));
  assert.ok(config.deferred.includes('/api/platform-customer-support-ui'));
  assert.ok(!config.deferred.includes('/api/customer-support-ui'));
  assert.ok(!config.deferred.includes('/api/platform-customer-support-thread-ui'));
  assert.match(lazyLoader,/\/api\/customer-support-ui\?v=20260907-1/);
  assert.match(lazyLoader,/\/api\/platform-customer-support-thread-ui\?v=20260907-1/);
  assert.match(lazyLoader,/loadGlobalSupport/);
});
