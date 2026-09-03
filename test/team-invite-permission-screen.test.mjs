import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const team=fs.readFileSync(path.join(root,'team.html'),'utf8');
const invites=fs.readFileSync(path.join(root,'api/team/invitations.js'),'utf8');
const members=fs.readFileSync(path.join(root,'api/team/members.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20260903184000_dabbir_team_invite_permission_gate_v1.sql'),'utf8');

test('owner invite flow has a dedicated permission step before sending',()=>{
  assert.match(team,/id="reviewPermissionsBtn"/);
  assert.match(team,/id="permissionStep"/);
  assert.match(team,/id="permissionGroups"/);
  assert.match(team,/data-permission/);
  assert.match(team,/التالي: تحديد الصلاحيات/);
  assert.match(team,/إرسال الدعوة بهذه الصلاحيات/);
});

test('invite always sends an explicit non-empty permission selection',()=>{
  assert.match(team,/const permissions=selectedPermissions\(\)/);
  assert.match(team,/!permissions\.includes\('view_business'\)/);
  assert.match(team,/permissions\}/);
  assert.doesNotMatch(team,/presets\[preset\]/);
});

test('permission catalog includes operational and booking controls',()=>{
  for(const marker of ['manage_store_operations','manage_appointments','reply_conversations','manage_team','manage_integrations']){
    assert.match(team,new RegExp(marker));
    assert.match(invites,new RegExp(marker));
    assert.match(members,new RegExp(marker));
  }
});

test('booking approval follows effective manage_appointments permission',()=>{
  assert.match(migration,/has_permission\(old\.business_id,'manage_appointments'\)/);
  assert.match(migration,/has_permission\(p_business_id,'manage_appointments'\)/);
  assert.doesNotMatch(migration,/m\.role in \('owner','admin','manager','employee','staff'\)/);
});
