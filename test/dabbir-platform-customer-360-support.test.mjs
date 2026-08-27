import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [migration,api,ui,shell]=await Promise.all([
  read('supabase/migrations/20260827161914_dabbir_platform_customer_360_support_v1.sql'),
  read('api/platform-customer-support.js'),
  read('api/platform-customer-support-ui.js'),
  read('api/app-recovery.js'),
]);

test('support cases and notes are private, RLS hardened and not client writable',()=>{
  assert.match(migration,/dabbir_private\.platform_customer_support_cases/);
  assert.match(migration,/dabbir_private\.platform_customer_support_notes/);
  assert.match(migration,/force row level security/i);
  assert.match(migration,/revoke all on dabbir_private\.platform_customer_support_cases from public, anon, authenticated/i);
  assert.match(migration,/revoke all on dabbir_private\.platform_customer_support_notes from public, anon, authenticated/i);
});

test('support RPCs are service-role only and pin an empty search path',()=>{
  for(const fn of ['dabbir_platform_support_summary','dabbir_platform_support_create','dabbir_platform_support_add_note','dabbir_platform_support_set_status']){
    assert.match(migration,new RegExp(`function public\\.${fn}`));
  }
  assert.match(migration,/set search_path = ''/i);
  assert.match(migration,/grant execute on function public\.dabbir_platform_support_summary\(uuid,text\) to service_role/i);
  assert.match(migration,/revoke all on function public\.dabbir_platform_support_summary\(uuid,text\) from public, anon, authenticated/i);
  assert.doesNotMatch(migration,/grant execute on function public\.dabbir_platform_support_[^(]+\([^;]+to authenticated/i);
});

test('support API is platform-admin gated and mutations require same origin',()=>{
  assert.match(api,/async function adminContext/);
  assert.match(api,/dabbir_platform_admins\?select=role,active/);
  assert.match(api,/requireSameOrigin\(req\)/);
  assert.match(api,/body\.action==='create_case'/);
  assert.match(api,/body\.action==='add_note'/);
  assert.match(api,/body\.action==='set_status'/);
  assert.match(api,/SUPABASE_SERVICE_ROLE_KEY/);
});

test('Customer 360 UI stays server-mediated and is mounted after customer administration',()=>{
  assert.match(ui,/الدعم الداخلي/);
  assert.match(ui,/Customers cannot see this data|هذه البيانات لا تظهر للعميل/);
  assert.match(ui,/\/api\/platform-customer-support/);
  assert.doesNotMatch(ui,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(ui,/create_case/);
  assert.match(ui,/add_note/);
  assert.match(ui,/set_status/);
  assert.match(shell,/platform-customers-ui[\s\S]*platform-customer-support-ui/);
});

test('support ledger preserves immutable note history by exposing no update/delete RPC',()=>{
  assert.doesNotMatch(migration,/support_update_note/i);
  assert.doesNotMatch(migration,/support_delete_note/i);
  assert.doesNotMatch(api,/delete_note|update_note/i);
});
