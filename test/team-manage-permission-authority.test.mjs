import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const team=fs.readFileSync(path.join(root,'team.html'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20260903191500_dabbir_team_manage_permission_authority_v2.sql'),'utf8');

test('team management UI follows effective manage_team permission, not role name alone',()=>{
  assert.match(team,/function canManageTeam\(\)[\s\S]*actorPermissions\(\)\.includes\('manage_team'\)/);
  assert.match(team,/isTeamManager=canManageTeam\(\)/);
  assert.match(team,/if\(!r\.ok\)\{isTeamManager=false;\$\('ownerPanel'\)\.classList\.add\('hidden'\)/);
});

test('manage_team is only offered to the admin role in the invite permission picker',()=>{
  assert.match(team,/function permissionApplicableToRole\(key,role\)\{return key!=='manage_team'\|\|role==='admin'\}/);
  assert.match(team,/allowed\.has\(key\)&&permissionApplicableToRole\(key,role\)/);
  assert.match(team,/allowedPermissionSetForRole\(\)/);
});

test('team mutations require effective manage_team permission in addition to role hierarchy',()=>{
  assert.match(migration,/can_user_manage_role[\s\S]*user_has_permission\(p_business_id,p_user_id,'manage_team'\)/);
  assert.match(migration,/can_manage_role[\s\S]*can_user_manage_role\(p_business_id,\(select auth\.uid\(\)\),p_target_role\)/);
});

test('new grants require explicit non-empty permissions and cannot exceed inviter permissions',()=>{
  assert.match(migration,/can_user_grant_permissions[\s\S]*cardinality\(coalesce\(p_permissions,'\{\}'::text\[\]\)\)>0/);
  assert.match(migration,/where not dabbir_private\.user_has_permission\(p_business_id,p_user_id,p\)/);
});

test('pending invitation is revalidated against inviter current team and permission authority',()=>{
  assert.match(migration,/can_user_manage_role\(v_inv\.business_id,v_inv\.invited_by,v_inv\.role\)/);
  assert.match(migration,/can_user_grant_permissions\(v_inv\.business_id,v_inv\.invited_by,v_inv\.permissions\)/);
  assert.match(migration,/INVITER_NO_LONGER_AUTHORIZED/);
});
