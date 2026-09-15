import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSecretLine } from '../.github/scripts/dabbir-git-history-secret-audit.mjs';

function serviceRoleJwt() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role: 'service_role', ref: 'example' })}.${'s'.repeat(32)}`;
}

test('history secret auditor detects concrete provider token formats without embedding a literal token in source', () => {
  const cases = [
    ['ghp_' + 'A'.repeat(40), 'github_token'],
    ['sk-' + 'A'.repeat(40), 'openai_key'],
    ['sk-ant-' + 'A'.repeat(40), 'anthropic_key'],
    ['gsk_' + 'A'.repeat(40), 'groq_key'],
    ['sk_live_' + 'A'.repeat(32), 'stripe_live_key'],
    ['sb_secret_' + 'A'.repeat(32), 'supabase_secret_key'],
    ['AIza' + 'A'.repeat(35), 'google_api_key'],
    ['GOCSPX-' + 'A'.repeat(28), 'google_oauth_client_secret'],
  ];
  for (const [value, detector] of cases) {
    assert.ok(detectSecretLine(`credential=${value}`).includes(detector), detector);
  }
});

test('history secret auditor detects a legacy Supabase service-role JWT by decoded role', () => {
  assert.ok(detectSecretLine(`key=${serviceRoleJwt()}`).includes('supabase_service_role_jwt'));
});

test('history secret auditor detects hardcoded named secrets and credentialed Postgres URLs', () => {
  assert.ok(detectSecretLine('SUPABASE_SERVICE_ROLE_KEY=' + 'A'.repeat(32)).includes('hardcoded_supabase_service_role_key'));
  assert.ok(detectSecretLine('VERCEL_TOKEN=' + 'B'.repeat(32)).includes('hardcoded_vercel_token'));
  assert.ok(detectSecretLine('SUPABASE_DB_URL=postgresql://postgres:' + 'C'.repeat(24) + '@db.example.com/postgres').includes('hardcoded_supabase_db_url'));
  assert.ok(detectSecretLine('db=postgresql://postgres:' + 'C'.repeat(24) + '@db.internal.invalid/postgres').includes('postgres_uri_with_password'));
});

test('history secret auditor ignores environment references, placeholders, and public anon-style JWTs', () => {
  assert.deepEqual(detectSecretLine('SUPABASE_SERVICE_ROLE_KEY=${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}'), []);
  assert.deepEqual(detectSecretLine('const key = process.env.OPENAI_API_KEY;'), []);
  assert.deepEqual(detectSecretLine('DATABASE_URL=postgresql://user:password@localhost:5432/app'), []);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const anon = `${encode({ alg: 'HS256' })}.${encode({ role: 'anon' })}.${'s'.repeat(32)}`;
  assert.deepEqual(detectSecretLine(`anon=${anon}`), []);
});

test('history secret auditor never needs to print or return secret values', () => {
  const secret = 'ghp_' + 'Z'.repeat(40);
  const detectors = detectSecretLine(`token=${secret}`);
  assert.deepEqual(detectors, ['github_token']);
  assert.ok(!JSON.stringify(detectors).includes(secret));
});
