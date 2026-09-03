import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync(new URL('../api/owner-command-center-v26.js',import.meta.url),'utf8');
const ui27=fs.readFileSync(new URL('../api/owner-command-center-v27.js',import.meta.url),'utf8');
const active=fs.readFileSync(new URL('../api/owner-command-center-v29.js',import.meta.url),'utf8');
const gateway=fs.readFileSync(new URL('../api/owner-dashboard-gateway.js',import.meta.url),'utf8');

test('active owner dashboard preserves executive operations v26 under the reviewed chain',()=>{
  assert.match(gateway,/owner-command-center-v29\.js/);
  assert.match(active,/owner-command-center-v28\.js/);
  assert.match(ui27,/owner-command-center-v26\.js/);
  assert.match(ui,/owner-command-center-v25\.js/);
});

test('owner home is an executive operations authority center, not reports only',()=>{
  for(const token of ['EXECUTIVE OPERATIONS AUTHORITY','مركز القيادة والتنفيذ','سلطة المالك التنفيذية','PLATFORM OWNER · EXECUTIVE AUTHORITY','منفذ الأوامر التنفيذي']) assert.match(ui,new RegExp(token));
  assert.match(ui,/ACTION → ARTIFACT → TEST → EVIDENCE/);
});

test('live CEO and executive truth are moved into the command center',()=>{
  assert.match(ui,/barmanExecutiveOsCeo/);
  assert.match(ui,/ownerExecutiveV23/);
  assert.match(ui,/ops26Leadership/);
  assert.match(ui,/customers\.querySelector\('\.oc22'\)/);
});

test('audited executor is promoted into command center without inventing unsafe powers',()=>{
  assert.match(ui,/#actionType/);
  assert.match(ui,/ops26Executor/);
  for(const token of ['المخزون والمنتجات','الخدمات والطلبات','بيانات النشاط والعميل','الدعم والحوادث']) assert.match(ui,new RegExp(token));
  for(const protectedToken of ['الدفع / Refund','قانون / عقود','KYC / OTP','حذف غير قابل للعكس']) assert.match(ui,new RegExp(protectedToken.replace('/','\\/')));
  assert.doesNotMatch(ui,/SUPABASE_SERVICE_ROLE_KEY|service_role|apikey/i);
});

test('navigation prioritizes command and execution and remains mobile responsive',()=>{
  for(const token of ["home:'القيادة'","operations:'التنفيذ'","customers:'العملاء والدعم'","system:'النظام'","governance:'الحوكمة والتدقيق'"]) assert.match(ui,new RegExp(token));
  assert.match(ui,/@media\(max-width:540px\)/);
  assert.match(ui,/window\.__dabbirOwnerOperations/);
});
