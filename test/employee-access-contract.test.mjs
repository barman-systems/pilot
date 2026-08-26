import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

const migration = await read('db/pilot_employee_access_v5.sql');
const authCore = await read('api/_auth-core.js');
const invitations = await read('api/team/invitations.js');
const accept = await read('api/team/accept-invite.js');
const members = await read('api/team/members.js');

test('employee invitations are one-time hashed tenant-scoped records', () => {
  assert.match(migration, /pilot_employee_invitations/);
  assert.match(migration, /token_hash text not null unique/i);
  assert.match(migration, /token_hash ~ '\^\[0-9a-f\]\{64\}\$'/i);
  assert.match(migration, /unique index[\s\S]*business_id,email[\s\S]*status='pending'/i);
  assert.match(migration, /p_business_id uuid/);
  assert.match(migration, /extensions\.digest\(p_token,'sha256'\)/i);
  assert.match(migration, /INVITATION_EMAIL_MISMATCH/);
  assert.match(migration, /status='accepted'/);
  assert.match(migration, /INVITATION_NOT_PENDING/);
});

test('non-owner membership activation is invitation-only and removal is soft', () => {
  assert.match(migration, /pilot_memberships_owner_insert/);
  assert.match(migration, /user_id=\(select auth\.uid\(\)\) and role='owner'/i);
  assert.match(migration, /revoke delete on public\.pilot_memberships from authenticated/i);
  assert.match(migration, /status in \('active','suspended','removed'\)/i);
  assert.match(migration, /NEW_INVITATION_REQUIRED/);
  assert.match(migration, /found and v_existing\.status='removed'[\s\S]*status='active'/i);
});

test('active status is part of every tenant permission decision', () => {
  assert.match(migration, /m\.status='active'/);
  assert.match(migration, /pilot_businesses_member_select[\s\S]*m\.status='active'/i);
  assert.match(authCore, /status=eq\.active/);
});

test('explicit permissions restrict role defaults and grants cannot exceed actor permissions', () => {
  assert.match(migration, /cardinality\(m\.permissions\)>0 and p_permission=any\(m\.permissions\)/i);
  assert.match(migration, /pilot_private\.valid_permissions/);
  assert.match(migration, /pilot_private\.can_grant_permissions/);
  assert.match(migration, /PERMISSION_GRANT_NOT_ALLOWED/);
  assert.match(migration, /'employee'/);
});

test('privileged RPC implementations are private and public wrappers are security invoker', () => {
  for (const name of ['pilot_create_employee_invitation','pilot_accept_employee_invitation','pilot_update_employee_access','pilot_set_employee_status','pilot_list_team']) {
    assert.match(migration, new RegExp(`pilot_private\\.${name}`));
    assert.match(migration, new RegExp(`public\\.${name}[\\s\\S]*?security invoker`, 'i'));
  }
  assert.doesNotMatch(migration, /create or replace function public\.pilot_(?:create_employee_invitation|accept_employee_invitation|update_employee_access|set_employee_status|list_team)[\s\S]{0,500}?security definer/i);
});

test('team APIs require authenticated identity and same-origin for mutations', () => {
  for (const source of [invitations, accept, members]) assert.match(source, /getVerifiedUser/);
  for (const source of [invitations, accept, members]) assert.match(source, /requireSameOrigin\(req\)/);
  assert.match(invitations, /crypto\.randomBytes\(32\)/);
  assert.match(invitations, /createHash\('sha256'\)/);
  assert.doesNotMatch([invitations, accept, members].join('\n'), /mail\.tm|api\.mail/i);
});

test('employee cannot mutate self through team management API', () => {
  assert.match(members, /SELF_TEAM_MUTATION_BLOCKED/);
  assert.match(members, /pilot_update_employee_access/);
  assert.match(members, /pilot_set_employee_status/);
});

test('audit and owner immutability cover lifecycle-sensitive changes', () => {
  for (const event of ['invitation_created','invitation_accepted','employee_suspended','employee_reactivated','employee_removed','role_changed','permission_changed']) {
    assert.match(migration, new RegExp(event));
  }
  assert.match(migration, /BUSINESS_OWNER_MEMBERSHIP_IMMUTABLE/);
  assert.match(migration, /new\.status<>'active'/);
});
