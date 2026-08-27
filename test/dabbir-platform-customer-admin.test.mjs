import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const api=await readFile(new URL('../api/platform-customers.js',import.meta.url),'utf8');
const ui=await readFile(new URL('../api/platform-customers-ui.js',import.meta.url),'utf8');
const shell=await readFile(new URL('../api/app-recovery.js',import.meta.url),'utf8');
const sql=await readFile(new URL('../supabase/migrations/20260827151557_dabbir_platform_customer_admin_v1.sql',import.meta.url),'utf8');

test('platform admin identity is separate and self-readable only',()=>{
  assert.match(sql,/create table if not exists public\.dabbir_platform_admins/i);
  assert.match(sql,/role in \('platform_owner','support_admin'\)/i);
  assert.match(sql,/user_id=\(select auth\.uid\(\)\)/i);
  assert.match(sql,/force row level security/i);
});

test('privileged platform RPCs are service-role only',()=>{
  for(const name of ['dabbir_platform_customer_search','dabbir_platform_customer_detail','dabbir_platform_recovery_preview','dabbir_platform_recovery_open','dabbir_platform_recovery_apply']){
    assert.match(sql,new RegExp(`revoke all on function public\\.${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`,'i'));
    assert.match(sql,new RegExp(`grant execute on function public\\.${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`,'i'));
  }
  assert.match(sql,/to service_role/i);
});

test('recovery requires explicit DAB confirmation',()=>{
  assert.match(sql,/RESTORE '\|\|v_customer_no/i);
  assert.match(sql,/DABBIR_RECOVERY_CONFIRMATION_REQUIRED/i);
  assert.match(api,/RECOVERY_CONFIRMATION_REQUIRED/);
  assert.match(ui,/RESTORE /);
});

test('server admin secret stays server-side',()=>{
  assert.match(api,/process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(ui,/SUPABASE_SERVICE_ROLE_KEY|service_role/i);
  assert.doesNotMatch(api,/sb_secret_|eyJ[A-Za-z0-9_-]{20,}/);
});

test('dashboard is capability-gated and injected into authoritative shell',()=>{
  assert.match(api,/dabbir_platform_admins\?select=role,active/);
  assert.match(api,/PLATFORM_ADMIN_REQUIRED/);
  assert.match(ui,/action=capability/);
  assert.match(ui,/إدارة عملاء DABBIR/);
  assert.match(shell,/\/api\/platform-customers-ui/);
});

test('state-changing recovery requires same-origin requests',()=>{
  assert.match(api,/requireSameOrigin\(req\)/);
  assert.match(api,/ORIGIN_REQUIRED/);
});
