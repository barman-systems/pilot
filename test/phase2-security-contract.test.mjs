import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCookies } from '../api/_auth-core.js';

const root = new URL('../', import.meta.url);
const read = async path => readFile(new URL(path, root), 'utf8');

const migration = await read('db/dabbir_phase2_auth_rbac_tenant_hardening_v1.sql');
const cleanup = await read('db/dabbir_phase2_rbac_performance_cleanup_v2.sql');
const authCore = await read('api/_auth-core.js');
const login = await read('api/auth/login.js');
const signup = await read('api/auth/signup.js');
const session = await read('api/auth/session.js');
const refresh = await read('api/auth/refresh.js');
const logout = await read('api/auth/logout.js');
const registry = JSON.parse(await read('config/runtime-registry.json'));

test('phase 2 RBAC includes owner/admin/manager/staff/viewer and defaults to explicit permissions', () => {
  for (const role of ['owner','admin','manager','staff','viewer']) assert.match(migration, new RegExp(`'${role}'`));
  assert.match(migration, /dabbir_private\.has_permission/);
  assert.match(migration, /dabbir_private\.can_manage_role/);
  assert.match(migration, /manage_team/);
  assert.match(migration, /manage_integrations/);
  assert.match(migration, /manage_appointments/);
});

test('all DABBIR tables are hardened to forced RLS with anonymous table grants revoked', () => {
  assert.match(migration, /revoke all privileges on table public\.%I from anon/i);
  assert.match(migration, /force row level security/i);
  assert.match(migration, /revoke update,delete on public\.dabbir_messages from authenticated/i);
  assert.match(migration, /revoke all on public\.dabbir_verification_challenges from anon,authenticated/i);
});

test('core relationship graph has business-scoped foreign keys', () => {
  const required = [
    'dabbir_conversations_business_customer_fk',
    'dabbir_messages_business_conversation_fk',
    'dabbir_appointments_business_customer_fk',
    'dabbir_appointments_business_service_fk',
    'dabbir_customer_identities_business_customer_fk',
    'dabbir_customer_management_business_customer_fk',
    'dabbir_customer_memory_business_customer_fk',
    'dabbir_handoffs_business_customer_fk',
    'dabbir_handoffs_business_conversation_fk',
  ];
  for (const name of required) assert.match(migration, new RegExp(name));
  assert.match(migration, /foreign key\(business_id,customer_id\)/i);
  assert.match(cleanup, /drop constraint if exists dabbir_conversations_customer_id_fkey/i);
});

test('channel state vocabulary cannot promote configuration into connection', () => {
  assert.match(migration, /update public\.dabbir_channels set status='configured' where status='simulated'/i);
  assert.match(migration, /'disconnected','configured','verifying','connected','degraded','failed'/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.dabbir_channels[\s\S]{0,500}runtime_verification_required/i);
  assert.equal(registry.projects.dabbir_clinics.external_channels, 'UNVERIFIED');
  assert.equal(registry.projects.dabbir_celebrities.external_channels, 'UNVERIFIED');
});

test('handoff mutations no longer use public SECURITY DEFINER bypasses', () => {
  for (const fn of ['dabbir_claim_handoff','dabbir_resolve_handoff','dabbir_return_handoff_to_ai']) {
    assert.match(migration, new RegExp(`alter function public\\.${fn}.*security invoker`, 'i'));
  }
  assert.match(cleanup, /dabbir_private\.approve_procedure_run_internal/);
  assert.match(cleanup, /public\.dabbir_approve_procedure_run[\s\S]*security invoker/i);
  assert.match(migration, /OWNER_REQUIRED_FOR_HIGH_RISK/);
});

test('auth sessions use secure host cookies and never localStorage or privileged keys', () => {
  assert.match(authCore, /__Host-dabbir_access/);
  assert.match(authCore, /__Host-dabbir_refresh/);
  assert.match(authCore, /Secure; HttpOnly; SameSite=Lax/);
  assert.match(authCore, /sb_publishable_/);
  const privilegedKeyPrefix = ['sb', 'secret', ''].join('_');
  assert.equal(authCore.includes(privilegedKeyPrefix), false);
  assert.doesNotMatch([authCore,login,signup,session,refresh,logout].join('\n'), /localStorage/);
});

test('state-changing auth endpoints require same-origin and bounded request bodies', () => {
  assert.match(authCore, /requireSameOrigin/);
  assert.match(authCore, /maxBytes = 8192/);
  for (const source of [login, signup]) {
    assert.match(source, /requireSameOrigin\(req\)/);
    assert.match(source, /readJsonBody\(req\)/);
  }
  for (const source of [refresh, logout]) assert.match(source, /requireSameOrigin\(req\)/);
});

test('session identity is verified server-side and memberships are resolved under user bearer RLS', () => {
  assert.match(authCore, /\/auth\/v1\/user/);
  assert.match(authCore, /dabbir_memberships\?select=business_id,role/);
  assert.match(authCore, /headers\.set\('authorization', `Bearer \$\{accessToken\}`\)/);
  assert.match(authCore, /supabaseRest\([\s\S]*accessToken,[\s\S]*options/);
  assert.match(session, /getVerifiedUser/);
  assert.match(session, /getBusinessMemberships/);
  assert.doesNotMatch(session, /dabbir_customers/);
});

test('cookie parser preserves encoded session token values', () => {
  assert.deepEqual(parseCookies('a=1; __Host-dabbir_access=abc%2Edef; x=3'), {
    a: '1',
    '__Host-dabbir_access': 'abc.def',
    x: '3',
  });
});
