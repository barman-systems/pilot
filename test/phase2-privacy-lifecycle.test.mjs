import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = async path => readFile(new URL(path, root), 'utf8');

const migration = await read('db/dabbir_phase2_privacy_lifecycle_v4.sql');
const api = await read('api/privacy/requests.js');
const authCore = await read('api/_auth-core.js');

test('patient data is sensitive and production use is fail-closed behind every required review', () => {
  assert.match(migration, /'PATIENT_DATA','SENSITIVE',true/i);
  assert.match(migration, /patient_data_mode text not null default 'SYNTHETIC_ONLY'/i);
  for (const gate of [
    'legal_review_status', 'privacy_review_status', 'security_review_status',
    'retention_review_status', 'cross_border_review_status', 'vendor_ai_review_status',
  ]) {
    assert.match(migration, new RegExp(`${gate}='APPROVED'`, 'i'));
  }
  assert.match(migration, /c\.patient_data_mode='APPROVED'/i);
  assert.match(migration, /production_patient_data_allowed/i);
});

test('authenticated clients cannot self-approve patient data controls', () => {
  assert.match(migration, /revoke all on public\.dabbir_privacy_controls from anon, authenticated/i);
  assert.match(migration, /grant select on public\.dabbir_privacy_controls to authenticated/i);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete)[^;]*dabbir_privacy_controls[^;]*authenticated/i);
  assert.doesNotMatch(migration, /policy [^\n]*dabbir_privacy_controls[^\n]*for update/i);
});

test('retention is unconfigured by default and cannot imply automatic deletion', () => {
  assert.match(migration, /policy_state text not null default 'UNCONFIGURED'/i);
  assert.match(migration, /'UNCONFIGURED','ACTIVE','LEGAL_HOLD'/i);
  assert.match(migration, /UNCONFIGURED means no automatic retention\/deletion execution may be assumed/i);
  assert.doesNotMatch(migration, /delete from public\.dabbir_(?:customers|messages|conversations|appointments)/i);
});

test('consent records are tenant-scoped, bounded, and not directly deletable by authenticated clients', () => {
  assert.match(migration, /dabbir_customer_consents_business_customer_fk/i);
  assert.match(migration, /foreign key \(business_id,customer_id\)[\s\S]*dabbir_customers\(business_id,id\)/i);
  assert.match(migration, /octet_length\(metadata::text\) <= 16384/i);
  assert.match(migration, /grant select,insert,update on public\.dabbir_customer_consents to authenticated/i);
  assert.doesNotMatch(migration, /grant delete on public\.dabbir_customer_consents to authenticated/i);
});

test('privacy requests are intake-only, owner-gated for business deletion, and cannot be completed by client mutation', () => {
  for (const type of ['BUSINESS_EXPORT','BUSINESS_DELETE','CUSTOMER_EXPORT','CUSTOMER_DELETE']) assert.match(migration, new RegExp(`'${type}'`));
  assert.match(migration, /request_type='BUSINESS_DELETE'[\s\S]*m\.role='owner'/i);
  assert.match(migration, /grant select,insert on public\.dabbir_privacy_requests to authenticated/i);
  assert.doesNotMatch(migration, /grant (?:update|delete)[^;]*dabbir_privacy_requests[^;]*authenticated/i);
  assert.match(migration, /No export\/delete is considered complete until a server-side executor verifies completion/i);
});

test('privacy audit is append-only to authenticated users and trigger-generated', () => {
  assert.match(migration, /revoke all on public\.dabbir_privacy_audit from anon, authenticated/i);
  assert.match(migration, /grant select on public\.dabbir_privacy_audit to authenticated/i);
  assert.match(migration, /create trigger dabbir_privacy_requests_audit/i);
  assert.match(migration, /create trigger dabbir_customer_consents_audit/i);
  assert.match(migration, /create trigger dabbir_retention_policies_audit/i);
  assert.doesNotMatch(migration, /grant insert[^;]*dabbir_privacy_audit[^;]*authenticated/i);
});

test('privacy request API requires authenticated cookie flow and same-origin for writes', () => {
  assert.match(api, /ACCESS_COOKIE/);
  assert.match(api, /getVerifiedUser/);
  assert.match(api, /requireSameOrigin\(req\)/);
  assert.match(api, /readJsonBody\(req, 8192\)/);
  assert.match(api, /supabaseRest\('dabbir_privacy_requests/);
  assert.match(api, /status: 'REQUESTED'/);
  assert.match(api, /execution_state: 'REVIEW_REQUIRED'/);
  assert.match(api, /data_exported: false/);
  assert.match(api, /data_deleted: false/);
  assert.doesNotMatch(api, /service[_-]?role/i);
});

test('authenticated REST helper preserves RLS authority and does not embed privileged credentials', () => {
  assert.match(authCore, /export async function supabaseRest/);
  assert.match(authCore, /authorization`, `Bearer \$\{accessToken\}`|authorization', `Bearer \$\{accessToken\}`|authorization.*Bearer/i);
  assert.match(authCore, /SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(authCore, /SUPABASE_SERVICE_ROLE_KEY/);
  const secretPrefix = ['sb', 'secret'].join('_') + '_';
  assert.equal(authCore.includes(secretPrefix), false);
});
