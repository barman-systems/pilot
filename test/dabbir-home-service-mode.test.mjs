import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const manifest=JSON.parse(read('config/dabbir-ui-bundles.json'));
const ownership=JSON.parse(read('config/dabbir-architecture-ownership.json'));
const api=read('api/home-service-operations.js');
const ui=read('api/home-service-ui.js');
const migration=read('supabase/migrations/20260902143500_dabbir_home_service_mode_p0.sql');

test('home service reuses appointments and does not grow the injected shell',()=>{
  const modules=[...manifest.critical,...manifest.deferred];
  assert.equal(modules.length,26);
  assert.equal(new Set(modules).size,modules.length);
  assert.ok(manifest.deferred.includes('/api/home-service-ui'));
  assert.ok(!manifest.deferred.includes('/api/dabbir-owner-decision-memory-ui'));
  assert.equal(ownership.shell.maximum_injected_api_modules,26);
  assert.equal(ownership.authorities.home_service_appointment_extension,'api/home-service-ui.js');
  assert.match(ui,/screen-appointments/);
  assert.doesNotMatch(ui,/data-screen=['"]home-service|showScreen\(['"]home-service/);
});

test('home service schema is vertical-neutral, constrained and fail-closed',()=>{
  for(const token of [
    'dabbir_home_service_settings','location_type','service_address','service_latitude','service_longitude',
    'travel_minutes','visit_fee_aed','field_status','enable row level security','revoke all','to authenticated',
    "location_type in ('business','customer')","field_status in ('scheduled','in_route','arrived','in_service','completed','cancelled')"
  ]) assert.ok(migration.includes(token),token);
  assert.match(migration,/dabbir_private\.has_permission\(business_id,'view_business'\)/);
  assert.match(migration,/dabbir_private\.has_permission\(business_id,'manage_business'\)/);
});

test('home service API fails closed and scopes every operation to a business membership',()=>{
  for(const token of ['accessTokenFromRequest','getBusinessMemberships','getVerifiedUser','requireSameOrigin','BUSINESS_ACCESS_DENIED','BUSINESS_MANAGEMENT_REQUIRED','APPOINTMENT_MANAGEMENT_REQUIRED'])assert.ok(api.includes(token),token);
  assert.match(api,/business_id=eq\.\$\{enc\(businessId\)\}/);
  assert.match(api,/method:'PATCH'/);
  assert.match(api,/location_type:'customer'/);
  assert.match(api,/CUSTOMER_ADDRESS_REQUIRED/);
});

test('home service UI is bilingual and exposes field execution states',()=>{
  for(const token of ['وضع الخدمة المنزلية','Home service mode','في الطريق','In route','وصل','Arrived','بدأت الخدمة','In service','رسوم الزيارة','Visit fee'])assert.ok(ui.includes(token),token);
  assert.match(ui,/Google\/Outlook/);
  assert.match(ui,/require_customer_address/);
});
