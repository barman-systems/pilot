import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync(new URL('../api/owner-command-center.js',import.meta.url),'utf8');
const gateway=fs.readFileSync(new URL('../api/owner-dashboard-gateway.js',import.meta.url),'utf8');

test('owner production remains pinned to one stable command-center entrypoint',()=>{
  assert.match(gateway,/import dashboard from '\.\/owner-command-center\.js'/);
  assert.doesNotMatch(gateway,/import dashboard from '\.\/owner-command-center-v\d+\.js'/);
  assert.match(ui,/authoritative:true/);
});

test('authoritative owner center fixes dense mobile navigation instead of horizontal clipping',()=>{
  assert.match(ui,/#nav\{display:grid!important;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(ui,/@media\(max-width:390px\)[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(ui,/min-height:46px/);
});

test('owner center keeps CEO history bounded and command input measurable',()=>{
  assert.match(ui,/\.ceocmd27list,.oc23list\{max-height:340px;overflow:auto/);
  assert.match(ui,/ownerCommandCounter/);
  assert.match(ui,/4000/);
});

test('support has an explicit customer-selection recovery path',()=>{
  assert.match(ui,/ownerSupportChooseCustomer/);
  assert.match(ui,/اختيار عميل الآن/);
  assert.match(ui,/__dabbirOwnerTabs\?\.open\('customers'\)/);
});

test('support feedback and primary navigation expose an active state',()=>{
  assert.match(ui,/data-owner-active/);
  assert.match(ui,/aria-current/);
  assert.match(ui,/sub==='support'\|\|sub==='feedback'/);
});

test('owner interface is Arabic-first while retaining executive semantics',()=>{
  assert.match(ui,/مركز قيادة مالك دبّر/);
  assert.match(ui,/صلاحية مالك المنصة/);
  assert.match(ui,/مكتب أوامر CEO/);
});

test('leadership tabs support keyboard navigation',()=>{
  assert.match(ui,/ArrowLeft/);
  assert.match(ui,/ArrowRight/);
  assert.match(ui,/Home/);
  assert.match(ui,/End/);
});
