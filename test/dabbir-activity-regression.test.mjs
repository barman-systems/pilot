import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

const activityApi = await read('api/activity-tasks.js');
const activityUi = await read('api/activity-profile-ui.js');
const mobileUi = await read('api/activity-mobile-polish-ui.js');
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
  assert.match(mobileUi, /if\(type==='store'\) return item\?\.type!=='appointment'/);
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

test('mobile navigation cannot wrap settings into a second row', () => {
  assert.match(mobileUi, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(mobileUi, /data-screen=\"settings\"\]\{display:none!important\}/);
});

test('mobile header strips DABBIR text and leaves the approved icon only', () => {
  assert.match(mobileUi, /removeMobileBrandText\(\)/);
  assert.match(mobileUi, /if\(!child\.classList\.contains\('logo'\)\)child\.remove\(\)/);
  assert.match(mobileUi, /logo\.textContent=''/);
});

test('activity mobile polish is always loaded after profile and action center layers', () => {
  const profileIndex = appRecovery.indexOf('/api/activity-profile-ui');
  const actionIndex = appRecovery.indexOf('/api/owner-action-center-ui');
  const polishIndex = appRecovery.indexOf('/api/activity-mobile-polish-ui');
  assert.ok(profileIndex >= 0 && actionIndex >= 0 && polishIndex >= 0);
  assert.ok(polishIndex > profileIndex);
  assert.ok(polishIndex > actionIndex);
});
