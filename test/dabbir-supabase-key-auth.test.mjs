import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applySupabaseKeyHeaders, isLegacySupabaseJwtKey, supabaseKeyHeaders } from '../api/_supabase-key-auth.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('modern Supabase keys use apikey only while legacy JWT keys retain bearer compatibility', () => {
  assert.equal(isLegacySupabaseJwtKey('sb_secret_example'), false);
  assert.equal(isLegacySupabaseJwtKey('sb_publishable_example'), false);
  assert.equal(isLegacySupabaseJwtKey('aaa.bbb.ccc'), true);

  assert.deepEqual(supabaseKeyHeaders('sb_secret_example', { accept: 'application/json' }), {
    apikey: 'sb_secret_example', accept: 'application/json',
  });
  assert.deepEqual(supabaseKeyHeaders('sb_publishable_example'), { apikey: 'sb_publishable_example' });
  assert.deepEqual(supabaseKeyHeaders('aaa.bbb.ccc'), {
    apikey: 'aaa.bbb.ccc', authorization: 'Bearer aaa.bbb.ccc',
  });

  const modern = new Headers({ authorization: 'Bearer stale' });
  applySupabaseKeyHeaders(modern, 'sb_secret_example');
  assert.equal(modern.get('apikey'), 'sb_secret_example');
  assert.equal(modern.has('authorization'), false);

  const legacy = new Headers();
  applySupabaseKeyHeaders(legacy, 'aaa.bbb.ccc');
  assert.equal(legacy.get('authorization'), 'Bearer aaa.bbb.ccc');
});

test('critical DABBIR service-key paths use centralized Supabase key authentication', async () => {
  const files = await Promise.all([
    read('api/_billing-core.js'),
    read('api/_calendar-core.js'),
    read('api/_whatsapp-live-core.js'),
    read('api/_apple-iap-core.js'),
    read('api/platform-customers.js'),
    read('api/platform-customer-support.js'),
    read('api/public-car-wash.js'),
    read('api/_tiktok-pilot-core.js'),
    read('api/_tiktok-messaging-core.js'),
  ]);
  for (const source of files) {
    assert.match(source, /_supabase-key-auth\.js/);
    assert.doesNotMatch(source, /apikey:\s*key,\s*authorization:\s*`Bearer \$\{key\}`/);
    assert.doesNotMatch(source, /headers\.set\(['"]apikey['"],\s*key\);\s*headers\.set\(['"]authorization['"],\s*`Bearer \$\{key\}`\)/);
  }
});

test('owner and billing edge bridges accept exact API-key authentication without gateway JWT assumptions', async () => {
  const [owner, billing] = await Promise.all([
    read('supabase/functions/dabbir-owner-broker/index.ts'),
    read('supabase/functions/barman-stripe-checkout/index.ts'),
  ]);
  assert.match(owner, /'apikey':SERVICE_KEY/);
  assert.match(owner, /serviceKeyIsJwt/);
  assert.match(billing, /apiKey===expected/);
  assert.match(billing, /legacyJwt&&auth===`Bearer \$\{expected\}`/);
  assert.match(billing, /x-dabbir-billing-bridge/);
});
