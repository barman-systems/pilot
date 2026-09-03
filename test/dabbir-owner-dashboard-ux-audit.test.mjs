import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync(new URL('../api/owner-command-center-v29.js',import.meta.url),'utf8');

test('owner UX audit reduces mobile primary-nav height without clipping controls',()=>{
  assert.match(ui,/body #nav\{display:grid!important;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(ui,/@media\(max-width:430px\)[\s\S]*repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(ui,/min-height:48px!important/);
});

test('duplicate customer workspace tabs are removed from the visible hierarchy',()=>{
  assert.match(ui,/#customers>\.ownerTabs25\{display:none!important\}/);
  assert.match(ui,/hideDuplicateCustomerTabs/);
  assert.match(ui,/aria-hidden/);
});

test('mission control fields have persistent visible labels and a live character counter',()=>{
  for(const label of ['الأمر التنفيذي','الهدف المطلوب','الأولوية','معايير القبول','الموعد النهائي'])assert.match(ui,new RegExp(label));
  assert.match(ui,/ownerMissionCommandCounter/);
  assert.match(ui,/4000/);
  assert.match(ui,/توقيت جهازك/);
});

test('iPhone mission lists use page scrolling instead of nested scroll traps',()=>{
  assert.match(ui,/#ownerCeoMissionControl \.ownerMissionList,#ownerCeoMissionControl \.ownerDecisionList,body \.oc23list\{max-height:none!important;overflow:visible!important/);
  assert.match(ui,/noMobileNestedScroll:true/);
});

test('primary mission action is ordered before refresh on mobile',()=>{
  assert.match(ui,/ownerMissionActions \.ownerMissionBtn\.primary\{grid-column:auto!important;order:-1\}/);
  assert.match(ui,/actions\.prepend\(primary\)/);
});

test('dangerous owner decisions get an accidental-tap guard',()=>{
  assert.match(ui,/data-cmd-op=\"cancel\"/);
  assert.match(ui,/إلغاء هذه المهمة/);
  assert.match(ui,/data-resolution=\"reject\"/);
  assert.match(ui,/رفض هذا القرار/);
});

test('empty guidance is blocked before a network mutation',()=>{
  assert.match(ui,/data-cmd-op=\"add_guidance\"/);
  assert.match(ui,/اكتب التوجيه الإضافي قبل الإرسال/);
  assert.match(ui,/stopImmediatePropagation/);
});

test('leadership tabs use a roving tabindex for keyboard users',()=>{
  assert.match(ui,/b\.tabIndex=b\.getAttribute\('aria-selected'\)==='true'\?0:-1/);
  assert.match(ui,/attributeFilter:\['aria-selected'\]/);
});

test('UX review does not add privileged client credentials or bypass owner auth',()=>{
  assert.doesNotMatch(ui,/service[_-]?role/i);
  assert.doesNotMatch(ui,/OWNER_SESSION_REQUIRED.*=.*true/);
  assert.doesNotMatch(ui,/localStorage/);
});
