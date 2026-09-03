import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('native country authority covers every GCC state and infers the iPhone region only when no persisted choice exists', () => {
  const source = read('mobile/src/country.ts');
  for (const token of ["'AE'", "'SA'", "'KW'", "'QA'", "'BH'", "'OM'", 'AED', 'SAR', 'KWD', 'QAR', 'BHD', 'OMR', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Kuwait', 'Asia/Qatar', 'Asia/Bahrain', 'Asia/Muscat', '+971', '+966', '+965', '+974', '+973', '+968']) {
    assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(source, /getLocales\(\)\[0\]\?\.regionCode/);
  assert.match(source, /return \(await loadSelectedCountry\(\)\) \|\| inferDeviceCountry\(\)/);
  assert.match(source, /WHEN_UNLOCKED_THIS_DEVICE_ONLY/);
});

test('native onboarding sends the resolved GCC country instead of trusting the legacy AE locale suffix', () => {
  const source = read('mobile/src/api.ts');
  assert.match(source, /resolveSelectedCountry/);
  assert.match(source, /country_code: resolved/);
  assert.match(source, /locale: `\$\{language\}-\$\{resolved\}`/);
  assert.match(source, /business_type: 'store'/);
  assert.match(source, /saveSelectedCountry\(countryCode\)/);
});

test('native server verifies persisted country currency timezone and phone prefix and uses the business local day', () => {
  const source = read('api/mobile/runtime.js');
  for (const token of ['BUSINESS_COUNTRY_PROFILE_UNVERIFIED', 'BUSINESS_GCC_PROFILE_UNVERIFIED', 'BUSINESS_LOCAL_DAY_FAILED', 'country_code,currency_code,timezone,phone_country_prefix', 'today_appointments:todayAppointments', 'mobile_local_day_verified:true', "p_country_code:countryCode"]) {
    assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(source, /simulated=eq\.false/);
  assert.match(source, /time_zone:business\.timezone/);
  assert.match(source, /currency_code:business\.currency_code/);
  assert.match(source, /x-dabbir-mobile-gcc-authority/);
});
