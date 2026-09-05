import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const team=read('api/_owner-platform-team-ui.js');
const design=read('api/_owner-command-center-design-system.js');
const gateway=read('api/owner-dashboard-gateway.js');
const governance=read('supabase/migrations/20260905205000_dabbir_owner_role_coarse_sync_v1.sql');

test('existing owner delegates can edit exact custom granular permission sets',()=>{
  assert.match(team,/data-gperm/);
  assert.match(team,/function selectedPerms\(/);
  assert.match(team,/roleCode==='CUSTOM'/);
  assert.match(team,/role==='CUSTOM'&&!granular\.length/);
  assert.match(team,/اختر صلاحية واحدة على الأقل للدور المخصص/);
  assert.match(team,/granular_permissions:granular/);
  assert.match(team,/updateRolePermissions\(card,prefix,sel\.value,\[\]\)/);
  assert.doesNotMatch(team,/استخدم قالبًا محددًا لحفظ الصلاحيات الحالية/);
});

test('custom grants require at least one explicit granular permission and keep root protected',()=>{
  assert.match(governance,/DABBIR_GRANULAR_PERMISSIONS_REQUIRED/);
  assert.match(governance,/platform_coarse_permissions_for_role/);
  assert.match(governance,/permissions=v_coarse,granular_permissions=v_granular/);
  assert.match(governance,/platform_assert_can_grant\(p_actor,v_coarse\)/);
  assert.match(team,/ROOT_OWNER/);
  assert.match(team,/ROOT_OWNER محمي/);
  for(const role of ['EXECUTIVE_ADMIN','OPERATIONS_MANAGER','CUSTOMER_SUPPORT','FINANCE','GROWTH_SALES','TECHNICAL_ADMIN','VIEWER_AUDITOR','CUSTOM'])assert.match(team,new RegExp(role));
});

test('owner executive design system overrides legacy 6-10px typography with readable sizes',()=>{
  assert.match(design,/ownerCommandCenterDesignSystem/);
  assert.match(design,/\.oc23metric span\{font-size:12px!important/);
  assert.match(design,/\.oc23metric b\{font-size:14px!important/);
  assert.match(design,/\.oc23row\{font-size:13px!important/);
  assert.match(design,/\.oc23item\{font-size:13px!important/);
  assert.match(design,/\.oc23note\{font-size:13px!important/);
  assert.match(design,/body #nav a,body #nav \.ownerMainTab29\{font-size:13\.5px!important/);
});

test('design system and team workspace are injected only after verified owner session',()=>{
  assert.match(gateway,/verifyOwnerSession/);
  assert.match(gateway,/injectOwnerExtensions\(res\)/);
  assert.match(gateway,/OWNER_COMMAND_CENTER_DESIGN_SYSTEM/);
  assert.match(gateway,/OWNER_PLATFORM_TEAM_UI/);
});
