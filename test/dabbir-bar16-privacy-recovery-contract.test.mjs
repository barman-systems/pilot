import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

const privacyMigration=await read('supabase/migrations/20260827162000_dabbir_customer_privacy_executor_v1.sql');
const recoveryMigration=await read('supabase/migrations/20260827162100_dabbir_recovery_customer_root_scope_fix_v2.sql');
const api=await read('api/privacy/execute.js');
const threatModel=await read('docs/security/bar-16-threat-model.md');

test('customer privacy delete is explicit owner-only and legal-hold aware',()=>{
  assert.match(privacyMigration,/m\.role='owner'/i);
  assert.match(privacyMigration,/LEGAL_HOLD_ACTIVE/i);
  assert.match(privacyMigration,/DELETE_CUSTOMER:/i);
  assert.match(privacyMigration,/EXPLICIT_DELETE_CONFIRMATION_REQUIRED/i);
  assert.match(privacyMigration,/CUSTOMER_DELETE_NOT_VERIFIED/i);
  assert.match(privacyMigration,/financial_records_retained/i);
  assert.match(privacyMigration,/stripe_customer_id=null/i);
});

test('customer export does not persist a second plaintext export body',()=>{
  assert.match(privacyMigration,/INLINE_EXPORT/i);
  assert.match(privacyMigration,/persisted_export_body',false/i);
  assert.match(privacyMigration,/result_ref='sha256:'/i);
  assert.doesNotMatch(privacyMigration,/set\s+result_ref\s*=\s*v_export/i);
});

test('privacy execution API uses authenticated cookie flow and same-origin writes',()=>{
  assert.match(api,/accessTokenFromRequest/);
  assert.match(api,/getVerifiedUser/);
  assert.match(api,/requireSameOrigin\(req\)/);
  assert.match(api,/membership\.role!=='owner'/);
  assert.match(api,/dabbir_execute_customer_privacy_request/);
  assert.doesNotMatch(api,/service[_-]?role/i);
});

test('customer-scoped recovery always includes the root customer row',()=>{
  assert.match(recoveryMigration,/if r\.table_name='dabbir_customers' then[\s\S]*v_customers := array\['id'\]/i);
  assert.match(recoveryMigration,/select dabbir_private\.recovery_refresh_registry\(\)/i);
  assert.match(recoveryMigration,/customer-scoped recovery includes the root customer row/i);
});

test('BAR-16 threat model locks the release gates and rotation policy',()=>{
  for(const required of [
    'Cross-tenant read/write',
    'Silent or accidental deletion',
    'Sensitive data in logs',
    'Integration key rotation policy',
    'Recovery failure and corruption',
    'Production deployment matches the merged commit',
  ]) assert.match(threatModel,new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'));
});