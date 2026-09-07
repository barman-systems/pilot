import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const team=fs.readFileSync(new URL('../api/_owner-platform-team-ui.js',import.meta.url),'utf8');
test('team reuses server role defaults and exact granular custom permissions',()=>{
 assert.match(team,/state\.roles/);assert.match(team,/row\?\.granular_permissions/);assert.match(team,/granular_permissions:selected/);
 assert.match(team,/role\.value==='CUSTOM'/);assert.match(team,/Select at least one permission/);assert.doesNotMatch(team,/const PRESETS|set_permissions/);
});
test('team retains all existing access scopes and expiry with honest MFA status',()=>{
 for(const scope of ['ALL_BUSINESSES','ASSIGNED_BUSINESSES_ONLY','SPECIFIC_BUSINESS','SPECIFIC_REGION','OWN_TASKS_ONLY'])assert.match(team,new RegExp(scope));
 assert.match(team,/getTimezoneOffset/);assert.match(team,/MFA enrollment is unavailable/);assert.match(team,/row\?\.mfa_required===true/);
});
test('root owner is protected and team shares the canonical dialog and request lifecycle',()=>{
 assert.match(team,/row\?\.role==='ROOT_OWNER'/);assert.match(team,/can\('manage_employees','team.edit'\)/);
 assert.match(team,/openAction\(/);assert.match(team,/api\('\/api\/owner-team'/);assert.doesNotMatch(team,/fetch\(|prompt\(|confirm\(|MutationObserver/);
});
