import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync(new URL('../api/owner-command-center-v24.js',import.meta.url),'utf8');
const reviewed=fs.readFileSync(new URL('../api/owner-command-center-v28.js',import.meta.url),'utf8');
const active=fs.readFileSync(new URL('../api/owner-command-center-v29.js',import.meta.url),'utf8');
const gateway=fs.readFileSync(new URL('../api/owner-dashboard-gateway.js',import.meta.url),'utf8');

test('owner dashboard keeps CEO center v24 in the active reviewed chain while preserving v23',()=>{
  assert.match(gateway,/owner-command-center-v29\.js/);
  assert.match(active,/owner-command-center-v28\.js/);
  assert.match(reviewed,/owner-command-center-v27\.js/);
  assert.match(ui,/owner-command-center-v23\.js/);
});

test('BARMAN Executive OS is visibly present as DABBIR CEO',()=>{
  for(const token of ['BARMAN Executive OS','CEO','barmanExecutiveOsCeo','المهمة التنفيذية الحالية','آخر إجراء موثّق','صلاحية CEO','دورة الإدارة','قرار المالك']) assert.match(ui,new RegExp(token));
  for(const step of ['Observe','Assess','Prioritize','Act','Verify','Record']) assert.match(ui,new RegExp(step));
  assert.match(ui,/ACTION → ARTIFACT → TEST → EVIDENCE/);
});

test('CEO center reads live executive truth and does not expose privileged credentials',()=>{
  assert.match(ui,/owner-dashboard-data\?action=executive/);
  assert.match(ui,/credentials:'same-origin'/);
  assert.match(ui,/recent_executive_actions/);
  assert.doesNotMatch(ui,/SUPABASE_SERVICE_ROLE_KEY|service_role|apikey/i);
});

test('CEO governance is explicit and responsive on iPhone viewports',()=>{
  assert.match(ui,/OWNER_ONLY/);
  assert.match(ui,/الدفع · القانون · KYC · OTP/);
  assert.match(ui,/@media\(max-width:700px\)/);
  assert.match(ui,/grid-template-columns:1fr/);
});

test('CEO state fails closed instead of inventing status',()=>{
  assert.match(ui,/DATA UNAVAILABLE/);
  assert.match(ui,/لم يتم افتراض أي حالة تنفيذية/);
  assert.doesNotMatch(ui,/Math\.random|fake|synthetic/i);
});
