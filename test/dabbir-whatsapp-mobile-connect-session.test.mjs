import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20260828183100_dabbir_whatsapp_mobile_connect_sessions_v1.sql', import.meta.url),
  'utf8',
);

test('WhatsApp mobile connect session storage is service-only and force-RLS protected', () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /force row level security/i);
  assert.match(migration, /revoke all on table public\.dabbir_whatsapp_mobile_connect_sessions from public/i);
  assert.match(migration, /revoke all on table public\.dabbir_whatsapp_mobile_connect_sessions from anon/i);
  assert.match(migration, /revoke all on table public\.dabbir_whatsapp_mobile_connect_sessions from authenticated/i);
  assert.match(migration, /grant select, insert, update, delete on table public\.dabbir_whatsapp_mobile_connect_sessions to service_role/i);
});

test('failed OAuth sessions can terminate before Meta issues an authorization code', () => {
  assert.match(
    migration,
    /status = 'failed'[\s\S]*code_ciphertext is null[\s\S]*code_iv is null[\s\S]*code_tag is null[\s\S]*code_key_version is null/i,
  );
});

test('captured or consumed OAuth state never permits partial encrypted code material', () => {
  assert.match(
    migration,
    /status in \('captured','completing','consumed'\)[\s\S]*code_ciphertext is not null[\s\S]*code_iv is not null[\s\S]*code_tag is not null[\s\S]*code_key_version is not null/i,
  );
  assert.match(
    migration,
    /status = 'pending'[\s\S]*code_ciphertext is null[\s\S]*code_iv is null[\s\S]*code_tag is null[\s\S]*code_key_version is null/i,
  );
});

test('connect sessions must expire after creation and do not store user or Meta access tokens', () => {
  assert.match(migration, /expires_at timestamptz not null check \(expires_at > created_at\)/i);
  assert.doesNotMatch(migration, /user_access_token|meta_access_token|refresh_token/i);
});
