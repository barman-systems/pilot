import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const read=path=>readFileSync(resolve(here,'..',path),'utf8');
const migration=read('supabase/migrations/20260903092000_dabbir_gcc_business_profile_v1.sql');
const marketMigration=read('supabase/migrations/20260903092251_dabbir_market_registry_expansion_v1.sql');
const publicBookingMigration=read('supabase/migrations/20260903060929_dabbir_public_booking_gcc_timezone.sql');
const marketCore=read('api/_market-core.js');
const createApi=read('api/gcc-create-business.js');
const profileApi=read('api/gcc-business-profile.js');
const adaptiveAppointment=read('api/adaptive-appointment.js');
const publicBookingApi=read('api/public-car-wash.js');
const publicBookingUi=read('api/gcc-public-booking-ui.js');
const publicBookingPage=read('api/car-wash-booking.js');
const ui=read('api/gcc-readiness-ui.js');
const timezoneUi=read('api/timezone-ui.js');
const bundles=JSON.parse(read('config/dabbir-ui-bundles.json'));

const expected={
  AE:['AED','Asia/Dubai','+971',2],
  SA:['SAR','Asia/Riyadh','+966',2],
  KW:['KWD','Asia/Kuwait','+965',3],
  QA:['QAR','Asia/Qatar','+974',2],
  BH:['BHD','Asia/Bahrain','+973',3],
  OM:['OMR','Asia/Muscat','+968',3],
};

test('legacy GCC migration remains backward-compatible',()=>{
  assert.match(migration,/dabbir_sync_gcc_business_profile/);
  assert.match(migration,/before insert or update of country_code, currency_code, timezone, phone_country_prefix/);
});

test('market registry replaces fixed GCC CHECK/CASE as the expansion authority',()=>{
  assert.match(marketMigration,/create table if not exists public\.dabbir_markets/);
  assert.match(marketMigration,/foreign key \(country_code\) references public\.dabbir_markets\(country_code\)/);
  assert.match(marketMigration,/from public\.dabbir_markets/);
  assert.match(marketMigration,/UNSUPPORTED_MARKET/);
  assert.match(marketMigration,/enable row level security/);
  assert.match(marketMigration,/for select to anon, authenticated using \(is_active = true\)/);
  assert.doesNotMatch(marketMigration,/country_code in \('AE','SA','KW','QA','BH','OM'\)/);
});

test('central market core carries localization and ISO currency precision for launch markets',()=>{
  for(const [country,[currency,timezone,prefix,minorUnits]] of Object.entries(expected)){
    assert.match(marketCore,new RegExp(`${country}:\\{[^}]*currency_code:'${currency}'[^}]*currency_minor_units:${minorUnits}[^}]*timezone:'${timezone}'[^}]*phone_country_prefix:'\\${prefix}'`));
  }
  assert.match(marketCore,/normalizeMarketCode/);
  assert.match(marketCore,/publicMarketProfiles/);
});

test('onboarding accepts market but never accepts currency from the browser as authority',()=>{
  assert.match(createApi,/from '\.\/_market-core\.js'/);
  assert.match(createApi,/p_country_code:countryCode/);
  assert.doesNotMatch(createApi,/body\?\.currency_code/);
  assert.match(createApi,/BUSINESS_MARKET_PROFILE_UNVERIFIED/);
  assert.match(ui,/from '\.\/_market-core\.js'/);
  assert.match(ui,/id='businessCountry'|select\.id='businessCountry'/);
  assert.doesNotMatch(ui,/select\.id='businessCurrency'/);
  assert.match(ui,/Currency is set automatically from the selected country/);
});

test('web create-business is rerouted atomically through the market-aware endpoint',()=>{
  assert.match(ui,/body\?\.action==='create_business'/);
  assert.match(ui,/baseFetch\('\/api\/gcc-create-business'/);
  assert.match(ui,/country_code:code/);
});

test('runtime profile validates market through the shared registry',()=>{
  assert.match(ui,/gcc-business-profile\?business_id=/);
  assert.match(ui,/style:'currency',currency:g\.currency/);
  assert.match(ui,/timeZone:g\.timezone/);
  assert.match(profileApi,/normalizeMarketCode/);
  assert.match(profileApi,/getBusinessMemberships/);
  assert.match(profileApi,/BUSINESS_ACCESS_DENIED/);
  assert.doesNotMatch(profileApi,/new Set\(\['AE','SA','KW','QA','BH','OM'\]\)/);
});

test('appointment UI is market-agnostic and timezone conversion is IANA/DST aware',()=>{
  assert.match(timezoneUi,/function businessGeo\(\)/);
  assert.match(timezoneUi,/business\?\.timezone\|\|document\.documentElement\.dataset\.dabbirTimezone/);
  assert.match(timezoneUi,/business\?\.currency_code\|\|document\.documentElement\.dataset\.dabbirCurrency/);
  assert.match(timezoneUi,/offsetMinutesAt/);
  assert.match(timezoneUi,/Intl\.DateTimeFormat\('en-US'/);
  assert.match(timezoneUi,/currencyMinorUnits/);
  assert.match(timezoneUi,/businessLocalToIso/);
  assert.doesNotMatch(timezoneUi,/const GCC=Object\.freeze/);
  assert.doesNotMatch(timezoneUi,/const DABBIR_TIME_ZONE='Asia\/Dubai'/);
  assert.doesNotMatch(timezoneUi,/Price \(AED\)/);
  assert.doesNotMatch(timezoneUi,/السعر \(درهم\)/);
  assert.match(timezoneUi,/market-agnostic-business-profile/);
});

test('appointment phone normalization follows business prefix but remains optional',()=>{
  assert.match(adaptiveAppointment,/phone_country_prefix/);
  assert.match(adaptiveAppointment,/phone_e164:e164\(rawPhone,business\.phone_country_prefix\)/);
  assert.match(adaptiveAppointment,/if\(!raw\)return null/);
  assert.doesNotMatch(adaptiveAppointment,/PHONE_REQUIRED/);
  assert.match(adaptiveAppointment,/currency_code:business\.currency_code/);
  assert.match(adaptiveAppointment,/timezone:business\.timezone/);
});

test('public booking database derives slots and validation dates from the business timezone',()=>{
  assert.match(publicBookingMigration,/b\.timezone/);
  assert.match(publicBookingMigration,/at time zone v_timezone/);
  assert.match(publicBookingMigration,/'currency_code', b\.currency_code/);
  assert.match(publicBookingMigration,/'phone_country_prefix', b\.phone_country_prefix/);
  assert.doesNotMatch(publicBookingMigration,/at time zone 'Asia\/Dubai'/);
});

test('public booking privileged RPC authority stays server-side',()=>{
  assert.match(publicBookingApi,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(publicBookingApi,/serviceRoleKey\(\)/);
  assert.doesNotMatch(publicBookingApi,/SUPABASE_PUBLISHABLE_KEY/);
});

test('public booking page renders currency, timezone and phone prefix from catalog profile',()=>{
  assert.match(publicBookingPage,/gcc-public-booking-ui/);
  assert.match(publicBookingUi,/profile\?\.timezone/);
  assert.match(publicBookingUi,/profile\?\.currency_code/);
  assert.match(publicBookingUi,/profile\?\.phone_country_prefix/);
  assert.match(publicBookingUi,/style:'currency',currency:currency\(\)/);
  assert.match(publicBookingUi,/searchParams\.set\('from_date',dateKey\(now\)\)/);
  assert.match(publicBookingUi,/data-slot/);
});

test('market readiness loads before deferred timezone UI during onboarding',()=>{
  assert.ok(bundles.critical.includes('/api/gcc-readiness-ui'));
  assert.ok(bundles.deferred.includes('/api/timezone-ui'));
});
