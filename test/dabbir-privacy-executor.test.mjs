import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const api=await read('api/privacy/execute.js');
const executor=await read('supabase/migrations/20260827162000_dabbir_customer_privacy_executor_v1.sql');
const recovery=await read('supabase/migrations/20260827162100_dabbir_recovery_customer_root_scope_fix_v2.sql');
const retained=await read('supabase/migrations/20260827162200_dabbir_privacy_retained_record_scrub_v2.sql');

test('privacy execution API is authenticated owner-gated and same-origin',()=>{
  assert.match(api,/requireSameOrigin\(req\)/);
  assert.match(api,/getVerifiedUser/);
  assert.match(api,/membership\.role!=='owner'/);
  assert.match(api,/dabbir_execute_customer_privacy_request/);
  assert.doesNotMatch(api,/SUPABASE_SERVICE_ROLE_KEY|service[_-]?role/i);
});

test('customer delete is explicit and blocks legal hold',()=>{
  assert.match(executor,/LEGAL_HOLD_ACTIVE/);
  assert.match(executor,/DELETE_CUSTOMER:/);
  assert.match(executor,/EXPLICIT_DELETE_CONFIRMATION_REQUIRED/);
  assert.match(executor,/CUSTOMER_DELETE_NOT_VERIFIED/);
});

test('customer export is inline and only hash metadata is persisted',()=>{
  assert.match(executor,/INLINE_EXPORT/);
  assert.match(executor,/persisted_export_body',false/);
  assert.match(executor,/result_ref='sha256:'/);
  assert.doesNotMatch(executor,/insert\s+into\s+[^;]*(export_blob|export_body|export_payload)/i);
});

test('financial records are retained but identity links are removed',()=>{
  assert.match(executor,/update public\.dabbir_orders set customer_id=null/i);
  assert.match(executor,/update public\.dabbir_payments set payer_customer_id=null,stripe_customer_id=null/i);
  assert.match(executor,/update public\.dabbir_financial_evidence[\s\S]*customer_id=null,conversation_id=null/i);
  assert.doesNotMatch(executor,/delete from public\.dabbir_(orders|payments|financial_evidence)/i);
});

test('retained operational records are payload-redacted before customer deletion',()=>{
  assert.match(retained,/before delete on public\.dabbir_customers/i);
  assert.match(retained,/update public\.dabbir_procedure_runs[\s\S]*input=jsonb_build_object\('privacy_redacted',true\)[\s\S]*output=jsonb_build_object\('privacy_redacted',true\)/i);
  assert.match(retained,/update public\.dabbir_quality_events[\s\S]*context=jsonb_build_object\('privacy_redacted',true\)/i);
  assert.match(retained,/revoke all on function dabbir_private\.dabbir_scrub_retained_customer_records\(\) from public,anon,authenticated/i);
});

test('customer-scoped recovery includes the root customer row',()=>{
  assert.match(recovery,/if r\.table_name='dabbir_customers' then\s*v_customers := array\['id'\]/i);
  assert.match(recovery,/select dabbir_private\.recovery_refresh_registry\(\)/i);
});
