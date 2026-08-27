import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260827141900_dabbir_public_customer_numbers_v1.sql', 'utf8');
const api = fs.readFileSync('api/dabbir-account-number.js', 'utf8');

test('customer number format is DAB plus stable sequence', () => {
  assert.match(migration, /DAB-/);
  assert.match(migration, /start with 100001/i);
  assert.match(migration, /customer_no_key unique/i);
  assert.match(migration, /user_id uuid primary key references auth\.users\(id\)/i);
});

test('numbers are assigned from DABBIR membership, not every auth user', () => {
  assert.match(migration, /after insert on public\.dabbir_memberships/i);
  assert.match(migration, /dabbir_membership_required/i);
});

test('authenticated users can only read their own number', () => {
  assert.match(migration, /user_id = auth\.uid\(\)/i);
  assert.match(migration, /dabbir_my_customer_no/i);
});

test('support resolver is not executable by client roles', () => {
  assert.match(migration, /revoke all on function public\.dabbir_support_resolve_account\(text\) from public, anon, authenticated/i);
});

test('account-number endpoint reuses DABBIR cookie authentication', () => {
  assert.match(api, /accessTokenFromRequest/);
  assert.match(api, /getVerifiedUser/);
  assert.match(api, /getBusinessMemberships/);
  assert.match(api, /dabbir_my_customer_no/);
  assert.match(api, /AUTH_REQUIRED/);
  assert.doesNotMatch(api, /@supabase\/supabase-js/);
});
