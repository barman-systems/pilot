import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const manual=fs.readFileSync(new URL('../api/car-wash-manual-booking-ui.js',import.meta.url),'utf8');
const loader=fs.readFileSync(new URL('../api/car-wash-loader-ui.js',import.meta.url),'utf8');
const appointment=fs.readFileSync(new URL('../api/adaptive-appointment.js',import.meta.url),'utf8');

test('car-wash manual booking loads saved packages and services with an Other choice',()=>{
  assert.match(manual,/\/api\/car-wash-admin\?business_id=/);
  assert.match(manual,/\/api\/service-catalog\?business_id=/);
  assert.match(manual,/Saved packages|الباقات المحفوظة/);
  assert.match(manual,/Saved services|الخدمات المحفوظة/);
  assert.match(manual,/Other — not in saved packages \/ services|أخرى — ليست ضمن الباقات \/ الخدمات/);
  assert.match(manual,/data\.apptKey='duration'|dataset\.apptKey='duration'/);
  assert.match(manual,/price\.value=String\(Number\(amount\)\)/);
});

test('car-wash saved customers use an in-app searchable combobox instead of Safari datalist',()=>{
  assert.match(manual,/dabbirCarWashCustomerMenu/);
  assert.match(manual,/role','combobox/);
  assert.match(manual,/aria-autocomplete','list/);
  assert.match(manual,/Search a saved customer or enter a new name|ابحث عن عميل دائم أو اكتب اسمًا جديدًا/);
  assert.match(manual,/dataset\.apptKey='customer_id'/);
  assert.match(manual,/hidden\.value=customer\?\.id\|\|''/);
  assert.match(manual,/dabbirCustomerChoice/);
  assert.match(manual,/كعميل جديد|as a new customer/);
  assert.doesNotMatch(manual,/createElement\('datalist'\)/);
  assert.doesNotMatch(manual,/setAttribute\('list'/);
});

test('car-wash selector enhancement cannot self-trigger a document mutation loop',()=>{
  assert.doesNotMatch(manual,/observe\(document\.documentElement,\{subtree:true,childList:true\}\)/);
  assert.match(manual,/cache\.business_id===id&&cache\.loaded/);
  assert.match(manual,/setTimeout\(\(\)=>enhance\(true\),0\)/);
  assert.match(manual,/v3-native-combobox/);
});

test('adaptive appointment reuses a selected customer only inside the active business',()=>{
  assert.match(appointment,/requestedCustomerId=clean\(d\.customer_id,60\)/);
  assert.match(appointment,/business_id=eq\.\$\{encodeURIComponent\(businessId\)\}.*id=eq\.\$\{encodeURIComponent\(requestedCustomerId\)\}/s);
  assert.match(appointment,/CUSTOMER_NOT_FOUND/);
  assert.match(appointment,/customer_reused:Boolean\(requestedCustomerId\)/);
});

test('car-wash loader mounts the mobile-safe manual booking enhancement only for car wash',()=>{
  assert.match(loader,/function loadManualBooking\(\)/);
  assert.match(loader,/\/api\/car-wash-manual-booking-ui/);
  assert.match(loader,/20260903-3-native-combobox/);
  assert.match(loader,/v8-historical-calendar-edit/);
});
