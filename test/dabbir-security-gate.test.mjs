import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  isClientSurface,
  scanChangedSqlAdditions,
  scanClientSource,
  scanNewMigration,
  scanSecretValues,
  scanServiceRoleEndpoint,
  verifySecurityContracts,
} from '../scripts/dabbir-security-gate.mjs';

const codes = rows => rows.map(row => row.code);
const securityWorkflow = fs.readFileSync(new URL('../.github/workflows/dabbir-security-gate.yml', import.meta.url), 'utf8');

test('browser and mobile surfaces are treated as secret-free trust boundaries', () => {
  assert.equal(isClientSurface('index.html'), true);
  assert.equal(isClientSurface('public/app.js'), true);
  assert.equal(isClientSurface('mobile/src/App.tsx'), true);
  assert.equal(isClientSurface('api/service-operations-ui.js'), true);
  assert.equal(isClientSurface('api/_billing-core.js'), false);
});

test('service-role and provider secret names cannot enter client-delivered source', () => {
  const source = `const a=process.env.SUPABASE_SERVICE_ROLE_KEY;\nconst b=process.env.DABBIR_WHATSAPP_APP_SECRET;`;
  const findings = scanClientSource('public/app.js', source);
  assert.equal(findings.length, 2);
  assert.deepEqual(new Set(codes(findings)), new Set(['CLIENT_SECRET_BOUNDARY']));
  assert.equal(scanClientSource('api/_server-only.js', source).length, 0);
});

test('committed live-token and private-key values are rejected', () => {
  const stripePrefix = ['sk', 'live', ''].join('_');
  const supabasePrefix = ['sb', 'secret', ''].join('_');
  const privateKeyMarker = ['-----BEGIN', 'PRIVATE', 'KEY-----'].join(' ');
  const source = [
    `const stripe='${stripePrefix}1234567890abcdefgh';`,
    `const supabase='${supabasePrefix}abcdefghijklmnopqrstuvwxyz';`,
    privateKeyMarker,
  ].join('\n');
  const findings = scanSecretValues('api/accidental-secret.js', source);
  assert(codes(findings).includes('COMMITTED_SECRET_VALUE'));
  assert(findings.length >= 3);
});

test('new tenant tables must enable RLS in the same migration', () => {
  const unsafe = `create table public.dabbir_probe (id uuid primary key, business_id uuid not null);`;
  assert(codes(scanNewMigration('supabase/migrations/20990101000000_probe.sql', unsafe)).includes('TENANT_TABLE_RLS_REQUIRED'));

  const safe = `${unsafe}\nalter table public.dabbir_probe enable row level security;`;
  assert(!codes(scanNewMigration('supabase/migrations/20990101000000_probe.sql', safe)).includes('TENANT_TABLE_RLS_REQUIRED'));
});

test('RLS weakening, BYPASSRLS and broad client grants fail closed', () => {
  const diff = [
    '+++ b/supabase/migrations/x.sql',
    '+alter table public.dabbir_customers disable row level security;',
    '+alter role app bypassrls;',
    '+grant all privileges on table public.dabbir_customers to authenticated;',
  ].join('\n');
  const findings = scanChangedSqlAdditions('supabase/migrations/x.sql', diff);
  assert.deepEqual(new Set(codes(findings)), new Set(['RLS_WEAKENING_FORBIDDEN', 'BYPASSRLS_FORBIDDEN', 'BROAD_CLIENT_GRANT_FORBIDDEN']));
});

test('SECURITY DEFINER functions must pin search_path', () => {
  const unsafe = `create or replace function public.dabbir_probe() returns void language plpgsql security definer as $$ begin null; end $$;`;
  assert(codes(scanNewMigration('supabase/migrations/20990101000001_probe.sql', unsafe)).includes('SECURITY_DEFINER_SEARCH_PATH_REQUIRED'));

  const safe = `create or replace function public.dabbir_probe() returns void language plpgsql security definer set search_path = public, pg_temp as $$ begin null; end $$;`;
  assert(!codes(scanNewMigration('supabase/migrations/20990101000001_probe.sql', safe)).includes('SECURITY_DEFINER_SEARCH_PATH_REQUIRED'));
});

test('publicly permissive policies require an explicit security-review marker', () => {
  const unsafe = `create policy p on public.dabbir_probe for select using (true);`;
  assert(codes(scanNewMigration('supabase/migrations/20990101000002_probe.sql', unsafe)).includes('PERMISSIVE_POLICY_REVIEW_REQUIRED'));

  const safe = `-- dabbir-security: allow-public-policy\ncreate policy p on public.dabbir_probe for select using (true);`;
  assert(!codes(scanNewMigration('supabase/migrations/20990101000002_probe.sql', safe)).includes('PERMISSIVE_POLICY_REVIEW_REQUIRED'));
});

test('anonymous function execution requires an explicit security-review marker', () => {
  const unsafe = `grant execute on function public.public_probe() to anon;`;
  assert(codes(scanNewMigration('supabase/migrations/20990101000003_probe.sql', unsafe)).includes('ANON_FUNCTION_EXECUTE_REVIEW_REQUIRED'));

  const safe = `-- dabbir-security: allow-anon-execute\ngrant execute on function public.public_probe() to anon;`;
  assert(!codes(scanNewMigration('supabase/migrations/20990101000003_probe.sql', safe)).includes('ANON_FUNCTION_EXECUTE_REVIEW_REQUIRED'));
});

test('service-role endpoints cannot trust a request business_id without an authorization boundary', () => {
  const unsafe = `const key=process.env.SUPABASE_SERVICE_ROLE_KEY; const businessId=body.business_id; await fetch('/rest?business_id='+businessId);`;
  assert(codes(scanServiceRoleEndpoint('api/unsafe.js', unsafe)).includes('SERVICE_ROLE_TENANT_AUTH_REQUIRED'));

  const safe = `${unsafe}\nconst memberships=await getBusinessMemberships(token); if(!membershipFor({memberships},businessId)) throw new Error('BUSINESS_ACCESS_DENIED');`;
  assert.equal(scanServiceRoleEndpoint('api/safe.js', safe).length, 0);
});

test('repository keeps mandatory source, AI, runtime and storage isolation contracts wired', () => {
  assert.deepEqual(verifySecurityContracts(), []);
  assert.match(securityWorkflow, /test\/dabbir-storage-tenant-isolation-contract\.test\.mjs/);
  assert.match(securityWorkflow, /test\/dabbir-whatsapp-ai-closed-loop-hardening\.test\.mjs/);
  assert.match(securityWorkflow, /test\/dabbir-whatsapp-multibranch-outbound-safety\.test\.mjs/);
});
