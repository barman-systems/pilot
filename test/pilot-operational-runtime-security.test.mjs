import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const migration = await readFile(new URL('db/pilot_operational_runtime_v10.sql', root), 'utf8');

test('ordinary owner operations do not require blanket AAL2', () => {
  assert.match(migration, /manage_integrations','manage_billing','export_data/);
  assert.match(migration, /p_permission <> all/);
  assert.match(migration, /pilot_private\.has_permission\(id,'view_business'\)/);
});

test('AI reply policy runs as caller and requires reply permission', () => {
  assert.match(migration, /pilot_ai_may_reply[\s\S]*security invoker/i);
  assert.match(migration, /has_permission\(p_business_id,'reply_conversations'\)/);
  assert.match(migration, /revoke all on function public\.pilot_ai_may_reply\(uuid,uuid\) from public/i);
  assert.match(migration, /from anon/i);
  assert.match(migration, /grant execute on function public\.pilot_ai_may_reply\(uuid,uuid\) to authenticated/i);
});

test('security-definer handoff creation is authenticated and permission scoped', () => {
  assert.match(migration, /pilot_create_handoff[\s\S]*security definer/i);
  assert.match(migration, /if auth\.uid\(\) is null then raise exception 'AUTH_REQUIRED'/i);
  assert.match(migration, /has_permission\(p_business_id,'manage_handoffs'\)/i);
  assert.match(migration, /revoke all on function public\.pilot_create_handoff[\s\S]*from public/i);
  assert.match(migration, /grant execute on function public\.pilot_create_handoff[\s\S]*to authenticated/i);
});
