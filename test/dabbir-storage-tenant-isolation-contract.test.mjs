import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260831143000_dabbir_car_wash_operations_v1.sql', import.meta.url), 'utf8');

function storagePolicyBlock(source) {
  const marker = 'create policy dabbir_car_wash_evidence_member on storage.objects';
  const start = source.indexOf(marker);
  assert(start >= 0, 'STORAGE_TENANT_POLICY_MISSING');
  return source.slice(start, start + 1800);
}

test('customer evidence bucket is private and cannot be flipped public by the authoritative migration', () => {
  assert.match(migration, /insert into storage\.buckets\s*\(id, name, public\)\s*values\s*\('dabbir-car-wash-evidence',\s*'dabbir-car-wash-evidence',\s*false\)/i);
  assert.match(migration, /on conflict \(id\) do update set public = false/i);
  assert.doesNotMatch(migration, /'dabbir-car-wash-evidence'[\s\S]{0,160}\bpublic\s*=\s*true/i);
});

test('storage object access is bound to the authenticated membership and business path prefix for read and write', () => {
  const policy = storagePolicyBlock(migration);
  assert.match(policy, /for all to authenticated/i);
  assert.match(policy, /bucket_id\s*=\s*'dabbir-car-wash-evidence'/i);
  assert.match(policy, /m\.business_id::text\s*=\s*split_part\(name,\s*'\/',\s*1\)/i);
  assert.match(policy, /m\.user_id\s*=\s*auth\.uid\(\)/i);
  assert.match(policy, /m\.status\s*=\s*'active'/i);
  assert.match(policy, /with check\s*\(/i);

  const businessScopeCount = (policy.match(/m\.business_id::text\s*=\s*split_part\(name,\s*'\/',\s*1\)/ig) || []).length;
  const identityScopeCount = (policy.match(/m\.user_id\s*=\s*auth\.uid\(\)/ig) || []).length;
  assert(businessScopeCount >= 2, 'STORAGE_READ_WRITE_BUSINESS_SCOPE_REQUIRED');
  assert(identityScopeCount >= 2, 'STORAGE_READ_WRITE_IDENTITY_SCOPE_REQUIRED');
});

test('storage policy does not authorize by caller-supplied business metadata alone', () => {
  const policy = storagePolicyBlock(migration);
  assert.doesNotMatch(policy, /metadata\s*->>?\s*'business_id'/i);
  assert.doesNotMatch(policy, /using\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(policy, /with check\s*\(\s*true\s*\)/i);
});
