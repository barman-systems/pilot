import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync(new URL('../api/owner-command-center-v25.js',import.meta.url),'utf8');
const gateway=fs.readFileSync(new URL('../api/owner-dashboard-gateway.js',import.meta.url),'utf8');

test('owner dashboard routes through v25 tabs while preserving CEO v24',()=>{
  assert.match(gateway,/owner-command-center-v25\.js/);
  assert.match(gateway,/owner-command-center-v24\.js/);
  assert.match(ui,/owner-command-center-v24\.js/);
});

test('owner customers workspace is split into clear tabs with CEO first',()=>{
  for(const token of ["['ceo','CEO']","['executive','الإدارة']","['customers','العملاء']","['support','الدعم']","['feedback','الملاحظات']"]) assert.match(ui,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(ui,/active='ceo'/);
  assert.match(ui,/ownerTabs25/);
  assert.match(ui,/aria-label','تبويبات مركز مالك دبّر'/);
});

test('long customer and support modules are assigned to separate panels',()=>{
  assert.match(ui,/oc20/);
  assert.match(ui,/oc16/);
  assert.match(ui,/oc15diag/);
  assert.match(ui,/return'support'/);
  assert.match(ui,/return'customers'/);
  assert.match(ui,/ownerTabHidden25/);
});

test('tabs are mobile friendly and remember current tab without weakening owner auth',()=>{
  assert.match(ui,/overflow-x:auto/);
  assert.match(ui,/@media\(max-width:520px\)/);
  assert.match(ui,/sessionStorage\.setItem\('dabbir_owner_tab25'/);
  assert.doesNotMatch(ui,/SUPABASE_SERVICE_ROLE_KEY|service_role|apikey/i);
});
