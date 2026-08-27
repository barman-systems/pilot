import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20260827181500_dabbir_team_direct_write_hardening_v1.sql', import.meta.url), 'utf8');
const slugMigration = await readFile(new URL('../supabase/migrations/20260827182000_dabbir_business_slug_source_alignment_v1.sql', import.meta.url), 'utf8');
const invitationsApi = await readFile(new URL('../api/team/invitations.js', import.meta.url), 'utf8');
const membersApi = await readFile(new URL('../api/team/members.js', import.meta.url), 'utf8');
const onboarding = await readFile(new URL('../db/dabbir_business_onboarding_v12.sql', import.meta.url), 'utf8');

test('team tables expose only the direct grants required by the runtime', () => {
  assert.match(migration, /revoke update on table public\.dabbir_memberships from authenticated/i);
  assert.match(migration, /drop policy if exists dabbir_memberships_team_update/i);
  assert.match(migration, /grant select, insert on table public\.dabbir_memberships to authenticated/i);
  assert.match(migration, /revoke insert, update, delete, truncate, references, trigger\s+on table public\.dabbir_employee_invitations from authenticated/i);
  assert.match(migration, /grant select on table public\.dabbir_employee_invitations to authenticated/i);
});

test('team mutations stay behind guarded RPCs', () => {
  assert.match(invitationsApi, /supabaseRpc\('dabbir_create_employee_invitation'/);
  assert.doesNotMatch(invitationsApi, /supabaseRest\([^\n]*dabbir_employee_invitations[^\n]*method:\s*['"](?:POST|PATCH|DELETE)['"]/i);
  assert.match(membersApi, /dabbir_update_employee_access|dabbir_set_employee_status/);
});

test('first-owner bootstrap still has the membership insert grant it requires', () => {
  assert.match(onboarding, /security invoker/i);
  assert.match(onboarding, /insert into public\.dabbir_memberships/i);
  assert.match(migration, /grant select, insert on table public\.dabbir_memberships to authenticated/i);
});

test('new business slugs can never resurrect the retired PILOT prefix', () => {
  assert.match(onboarding, /v_slug\s*:=\s*'dabbir-'/i);
  assert.doesNotMatch(onboarding, /v_slug\s*:=\s*'pilot-'/i);
  assert.match(slugMigration, /v_slug\s*:=\s*'dabbir-'/i);
  assert.doesNotMatch(slugMigration, /v_slug\s*:=\s*'pilot-'/i);
});
