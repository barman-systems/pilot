import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync(new URL('../api/owner-command-center-v29.js',import.meta.url),'utf8');
const gateway=fs.readFileSync(new URL('../api/owner-dashboard-gateway.js',import.meta.url),'utf8');

test('v29 is the active owner workspace and preserves the complete reviewed chain',()=>{
  assert.match(gateway,/owner-command-center-v29\.js/);
  assert.match(ui,/owner-command-center-v28\.js/);
});

test('leadership is split into compact tabs instead of one long command page',()=>{
  for(const token of ["['overview','الملخص']","['ceo','أوامر CEO']","['executive','الإدارة']","['execute','التنفيذ']"]) assert.ok(ui.includes(token),token);
  assert.match(ui,/ownerLeadTabs29/);
  assert.match(ui,/ownerLeadHidden29/);
  assert.match(ui,/ownerCeoCommandDeskV27/);
  assert.match(ui,/ownerExecutiveV23/);
  assert.match(ui,/ops26Executor/);
  assert.match(ui,/sessionStorage\.setItem\('dabbir_owner_lead29'/);
});

test('redundant global customer search is removed while customer workspace remains the search source',()=>{
  assert.match(ui,/\$\('#globalSearch'\)\|\|\$\('#cmd'\)/);
  assert.match(ui,/closest\('\.command'\)/);
  assert.match(ui,/command\.remove\(\)/);
  assert.match(ui,/\.top \.command\{display:none!important\}/);
  assert.doesNotMatch(ui,/accountSearch|customerQuery.*remove/);
});

test('support and feedback are first-class working navigation targets',()=>{
  assert.match(ui,/data-owner-customer29/);
  assert.match(ui,/support\.textContent='الدعم'/);
  assert.match(ui,/feedback\.textContent='الملاحظات'/);
  assert.match(ui,/window\.__dabbirOwnerTabs\.open\(key\)/);
  assert.match(ui,/__dabbirFeedbackInbox\?\.refresh\(\)/);
  assert.match(ui,/\$\('#oc20Refresh'\)\?\.click\(\)/);
  assert.match(ui,/اختر عميلًا من تبويب العملاء أولًا/);
  assert.match(ui,/\[data-tab25="support"\],\[data-tab25="feedback"\]/);
});

test('v29 remains iPhone friendly and does not introduce privileged client credentials',()=>{
  assert.match(ui,/@media\(max-width:760px\)/);
  assert.match(ui,/@media\(max-width:390px\)/);
  assert.match(ui,/min-height:46px/);
  assert.match(ui,/focus-visible/);
  assert.doesNotMatch(ui,/SUPABASE_SERVICE_ROLE_KEY|service_role|apikey|authorization:`Bearer/i);
});
