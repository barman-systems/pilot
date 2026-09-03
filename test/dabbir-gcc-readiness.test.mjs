import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const read=path=>readFileSync(resolve(here,'..',path),'utf8');
const migration=read('supabase/migrations/20260903092000_dabbir_gcc_business_profile_v1.sql');
const createApi=read('api/gcc-create-business.js');
const profileApi=read('api/gcc-business-profile.js');
const adaptiveAppointment=read('api/adaptive-appointment.js');
const ui=read('api/gcc-readiness-ui.js');
const timezoneUi=read('api/timezone-ui.js');
const bundles=JSON.parse(read('config/dabbir-ui-bundles.json'));

const expected={
  AE:['AED','Asia/Dubai','+971'],
  SA:['SAR','Asia/Riyadh','+966'],
  KW:['KWD','Asia/Kuwait','+965'],
  QA:['QAR','Asia/Qatar','+974'],
  BH:['BHD','Asia/Bahrain','+973'],
  OM:['OMR','Asia/Muscat','+968'],
};

test('database makes GCC country authoritative over currency, timezone and phone prefix',()=>{
  assert.match(migration,/dabbir_sync_gcc_business_profile/);
  assert.match(migration,/before insert or update of country_code, currency_code, timezone, phone_country_prefix/);
  for(const [country,[currency,timezone,prefix]] of Object.entries(expected)){
    assert.match(migration,new RegExp(`country_code='${country}'.*currency_code='${currency}'.*timezone='${timezone}'.*phone_country_prefix='\\${prefix}'`,'s'));
  }
});

test('GCC onboarding accepts country but never accepts currency from the browser as authority',()=>{
  assert.match(createApi,/p_country_code:countryCode/);
  assert.doesNotMatch(createApi,/body\?\.currency_code/);
  assert.match(createApi,/BUSINESS_COUNTRY_PROFILE_UNVERIFIED/);
  assert.match(ui,/id='businessCountry'|select\.id='businessCountry'/);
  assert.doesNotMatch(ui,/select\.id='businessCurrency'/);
  assert.match(ui,/Currency is set automatically from the selected country/);
});

test('web create-business is rerouted atomically through the GCC-aware endpoint',()=>{
  assert.match(ui,/body\?\.action==='create_business'/);
  assert.match(ui,/baseFetch\('\/api\/gcc-create-business'/);
  assert.match(ui,/country_code:code/);
});

test('runtime is enriched with tenant-scoped country profile and dynamic time/money formatting',()=>{
  assert.match(ui,/gcc-business-profile\?business_id=/);
  assert.match(ui,/style:'currency',currency:g\.currency/);
  assert.match(ui,/timeZone:g\.timezone/);
  assert.match(profileApi,/getBusinessMemberships/);
  assert.match(profileApi,/BUSINESS_ACCESS_DENIED/);
});

test('deferred appointment UI cannot overwrite GCC timezone or price labels with UAE-only constants',()=>{
  assert.match(timezoneUi,/function businessGeo\(\)/);
  assert.match(timezoneUi,/business\?\.timezone\|\|base\.timezone/);
  assert.match(timezoneUi,/business\?\.currency_code\|\|base\.currency/);
  assert.match(timezoneUi,/businessLocalToIso/);
  assert.match(timezoneUi,/geo\.prefix/);
  assert.doesNotMatch(timezoneUi,/const DABBIR_TIME_ZONE='Asia\/Dubai'/);
  assert.doesNotMatch(timezoneUi,/Price \(AED\)/);
  assert.doesNotMatch(timezoneUi,/السعر \(درهم\)/);
  assert.match(timezoneUi,/x-dabbir-timezone','business-profile/);
});

test('appointment phone normalization follows business prefix but remains optional',()=>{
  assert.match(adaptiveAppointment,/phone_country_prefix/);
  assert.match(adaptiveAppointment,/phone_e164:e164\(rawPhone,business\.phone_country_prefix\)/);
  assert.match(adaptiveAppointment,/if\(!raw\)return null/);
  assert.doesNotMatch(adaptiveAppointment,/PHONE_REQUIRED/);
  assert.match(adaptiveAppointment,/currency_code:business\.currency_code/);
  assert.match(adaptiveAppointment,/timezone:business\.timezone/);
});

test('GCC readiness loads in the critical bundle so country is available during onboarding',()=>{
  assert.ok(bundles.critical.includes('/api/gcc-readiness-ui'));
});
