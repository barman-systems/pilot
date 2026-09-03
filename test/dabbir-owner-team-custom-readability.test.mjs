import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const team=read('api/_owner-platform-team-ui.js');
const design=read('api/_owner-command-center-design-system.js');
const gateway=read('api/owner-dashboard-gateway.js');

test('existing owner delegates can edit exact custom permission sets',()=>{
  assert.match(team,/data-staff-permissions/);
  assert.match(team,/input\[data-permission-scope\^="staff-"\]/);
  assert.match(team,/permissions=selectedPermissions\(grid\)/);
  assert.match(team,/presetFor\(selectedPermissions\(grid\)\)/);
  assert.doesNotMatch(team,/استخدم قالبًا محددًا لحفظ الصلاحيات الحالية/);
});

test('team permissions require at least one explicit grant and keep root protected in UI',()=>{
  assert.match(team,/اختر صلاحية واحدة على الأقل/);
  assert.match(team,/ROOT_OWNER/);
  assert.match(team,/هوية المالك الأصلية محمية/);
  for(const preset of ['full','operations','support','technical','finance','custom'])assert.match(team,new RegExp(`${preset}:`));
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
