import * as SecureStore from 'expo-secure-store';
import { getLocales } from 'expo-localization';

export type GccCountryCode = 'AE' | 'SA' | 'KW' | 'QA' | 'BH' | 'OM';

export const GCC_COUNTRIES: ReadonlyArray<{ code: GccCountryCode; ar: string; en: string; currency: string; timezone: string; prefix: string }> = [
  { code: 'AE', ar: 'الإمارات', en: 'United Arab Emirates', currency: 'AED', timezone: 'Asia/Dubai', prefix: '+971' },
  { code: 'SA', ar: 'السعودية', en: 'Saudi Arabia', currency: 'SAR', timezone: 'Asia/Riyadh', prefix: '+966' },
  { code: 'KW', ar: 'الكويت', en: 'Kuwait', currency: 'KWD', timezone: 'Asia/Kuwait', prefix: '+965' },
  { code: 'QA', ar: 'قطر', en: 'Qatar', currency: 'QAR', timezone: 'Asia/Qatar', prefix: '+974' },
  { code: 'BH', ar: 'البحرين', en: 'Bahrain', currency: 'BHD', timezone: 'Asia/Bahrain', prefix: '+973' },
  { code: 'OM', ar: 'عُمان', en: 'Oman', currency: 'OMR', timezone: 'Asia/Muscat', prefix: '+968' },
];

const COUNTRY_KEY = 'dabbir.country.v1';
const VALID = new Set<GccCountryCode>(GCC_COUNTRIES.map(item => item.code));

export function isGccCountryCode(value: unknown): value is GccCountryCode {
  return VALID.has(String(value || '').toUpperCase() as GccCountryCode);
}

export function inferDeviceCountry(): GccCountryCode {
  const region = String(getLocales()[0]?.regionCode || '').toUpperCase();
  return isGccCountryCode(region) ? region : 'AE';
}

export async function loadSelectedCountry(): Promise<GccCountryCode | null> {
  const raw = String(await SecureStore.getItemAsync(COUNTRY_KEY) || '').toUpperCase();
  return isGccCountryCode(raw) ? raw : null;
}

export async function resolveSelectedCountry(): Promise<GccCountryCode> {
  return (await loadSelectedCountry()) || inferDeviceCountry();
}

export async function saveSelectedCountry(country: GccCountryCode): Promise<void> {
  if (!isGccCountryCode(country)) throw new Error('UNSUPPORTED_GCC_COUNTRY');
  await SecureStore.setItemAsync(COUNTRY_KEY, country, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}

export function countryProfile(country: GccCountryCode) {
  return GCC_COUNTRIES.find(item => item.code === country) || GCC_COUNTRIES[0];
}
