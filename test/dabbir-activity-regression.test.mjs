import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

const activityApi = await read('api/activity-tasks.js');
const activityUi = await read('api/activity-profile-ui.js');
const ownerUi = await read('api/dabbir-owner-first-ui.js');
const brandUi = await read('api/brand-ui.js');
const indexHtml = await read('index.html');
const appRecovery = await read('api/app-recovery.js');
const appointmentGuard = await read('db/dabbir_activity_type_appointment_guard_v1.sql');

const activityTypes = ['clinic','store','salon','real_estate','creator','services','other'];

for (const type of activityTypes) {
  test(`activity profile exists for ${type}`, () => {
    assert.match(activityApi, new RegExp(`\\b${type}:\\{`));
  });
}

test('store is inventory/order driven and cannot expose appointments or services', () => {
  assert.match(activityApi, /store:\{[^\n]*show_appointments:false[^\n]*show_services:false[^\n]*show_operations:true/);
  assert.match(ownerUi, /if\(type==='store'\)return item\?\.type!=='appointment'/);
  assert.match(appointmentGuard, /if v_type = 'store'/);
  assert.match(appointmentGuard, /APPOINTMENTS_NOT_ALLOWED_FOR_STORE/);
});

test('clinic, salon and services expose service scheduling semantics', () => {
  assert.match(activityApi, /clinic:\{[^\n]*customer_ar:'المرضى'[^\n]*show_appointments:true[^\n]*show_services:true/);
  assert.match(activityApi, /salon:\{[^\n]*appointments_ar:'الحجوزات'[^\n]*show_appointments:true[^\n]*show_services:true/);
  assert.match(activityApi, /services:\{[^\n]*appointments_ar:'الحجوزات \/ الطلبات'[^\n]*show_appointments:true[^\n]*show_services:true/);
});

test('real estate and creator use domain-specific labels instead of generic CRM labels', () => {
  assert.match(activityApi, /real_estate:\{[^\n]*customer_ar:'العملاء المحتملون'[^\n]*appointments_ar:'المعاينات'/);
  assert.match(activityApi, /creator:\{[^\n]*conversation_ar:'طلبات التعاون'[^\n]*customer_ar:'جهات التعاون'[^\n]*appointments_ar:'الجدول'/);
});

test('activity profile rewrites navigation, dashboard metrics and task labels', () => {
  assert.match(activityUi, /patchDictionary\(p\)/);
  assert.match(activityUi, /setLabel\('conversations',conversationLabel\)/);
  assert.match(activityUi, /setLabel\('customers',customerLabel\)/);
  assert.match(activityUi, /setLabel\('tasks',taskLabel\)/);
  assert.match(activityUi, /cards\[0\]/);
  assert.match(activityUi, /cards\[1\]/);
  assert.match(activityUi, /cards\[2\]/);
});

test('owner-first mobile navigation stays one five-column row with settings reachable', () => {
  assert.match(ownerUi, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(ownerUi, /#bottomNav>button/);
  assert.doesNotMatch(ownerUi, /data-screen=\\"settings\\"[^\n]*display:none/);
});

test('mobile header uses the approved DABBIR icon and no floating duplicate brand', () => {
  assert.match(ownerUi, /const ICON='\/api\/dabbir-approved-icon'/);
  assert.match(ownerUi, /d4-header-mark/);
  assert.match(ownerUi, /\.dabbirMobileBrand\{display:none!important\}/);
});

test('owner-first UI is the only mobile presentation authority loaded after activity and action center', () => {
  const profileIndex = appRecovery.indexOf('/api/activity-profile-ui');
  const actionIndex = appRecovery.indexOf('/api/owner-action-center-ui');
  const ownerUiIndex = appRecovery.indexOf('/api/dabbir-owner-first-ui');
  assert.ok(profileIndex >= 0 && actionIndex >= 0 && ownerUiIndex >= 0);
  assert.ok(ownerUiIndex > profileIndex);
  assert.ok(ownerUiIndex > actionIndex);
  assert.equal(appRecovery.includes('/api/activity-mobile-polish-ui'), false);
  assert.equal(appRecovery.includes('/api/dabbir-ui-refinement'), false);
  assert.equal(appRecovery.includes('/api/dabbir-mobile-shell-v3'), false);
  assert.equal(appRecovery.includes('/api/dabbir-logo-placement-ui'), false);
});

test('owner-first UI has no continuous presentation polling loop', () => {
  assert.doesNotMatch(ownerUi, /setInterval\(/);
  assert.match(ownerUi, /pollingLoops:0/);
});


test('brand layer leaves mobile header ownership to the owner-first shell', () => {
  assert.match(brandUi, /owner-first shell owns the mobile header mark/);
  assert.match(brandUi, /body\.dabbirAppActive>\.dabbirMobileBrand\{display:none!important\}/);
  assert.match(indexHtml, /<img src="\/api\/dabbir-approved-icon" alt="DABBIR">/);
});
