import type { DabbirSession } from './session';
import { countryProfile, inferDeviceCountry, isGccCountryCode, resolveSelectedCountry, saveSelectedCountry, type GccCountryCode } from './country';

const configuredBase = String(process.env.EXPO_PUBLIC_DABBIR_API_BASE_URL || '').trim().replace(/\/$/, '');
const deviceProfile = countryProfile(inferDeviceCountry()) || countryProfile('AE');
if (!deviceProfile) throw new Error('GCC_DEVICE_PROFILE_UNAVAILABLE');
let runtimeCurrencyCode = deviceProfile.currency;
let runtimeTimezone = deviceProfile.timezone;

function syncBusinessProfile(payload: any): void {
  const currency = String(payload?.currency_code || payload?.business?.currency_code || payload?.business_profile?.currency_code || '').toUpperCase();
  const timezone = String(payload?.timezone || payload?.business?.timezone || payload?.business_profile?.timezone || '').trim();
  if (/^[A-Z]{3}$/.test(currency)) runtimeCurrencyCode = currency;
  if (timezone) {
    try { new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date()); runtimeTimezone = timezone; } catch {}
  }
}

export function currentCurrencyCode(): string {
  return runtimeCurrencyCode;
}

export function formatAmount(value: unknown): string {
  return `${Number(value || 0).toFixed(2)} ${runtimeCurrencyCode}`;
}

export function businessDateToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: runtimeTimezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function apiBase(): string {
  if (!configuredBase || !/^https:\/\//i.test(configuredBase)) {
    throw new Error('DABBIR_API_BASE_URL_NOT_CONFIGURED');
  }
  return configuredBase;
}

async function parseJson(response: Response) {
  const text = await response.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!response.ok) {
    const error = new Error(String(payload?.error || `HTTP_${response.status}`));
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return payload;
}

async function post(path: string, body: unknown, accessToken?: string) {
  const response = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return parseJson(response);
}

export async function login(email: string, password: string): Promise<DabbirSession> {
  const payload = await post('/api/mobile/auth/login', { email, password });
  return payload.session as DabbirSession;
}

export async function signup(email: string, password: string): Promise<{ session: DabbirSession | null; verification_required: boolean }> {
  const payload = await post('/api/mobile/auth/signup', { email, password });
  return { session: payload.session || null, verification_required: Boolean(payload.verification_required) };
}

export async function requestPasswordRecovery(email: string): Promise<void> {
  await post('/api/mobile/auth/forgot-password', { email });
}

export async function providerLogin(provider: 'apple' | 'google', idToken: string, options: { accessToken?: string; nonce?: string; fullName?: string } = {}): Promise<DabbirSession> {
  const payload = await post('/api/mobile/auth/provider', {
    provider,
    id_token: idToken,
    ...(options.accessToken ? { access_token: options.accessToken } : {}),
    ...(options.nonce ? { nonce: options.nonce } : {}),
    ...(options.fullName ? { full_name: options.fullName } : {}),
  });
  return payload.session as DabbirSession;
}

export async function refresh(refreshToken: string): Promise<DabbirSession> {
  const payload = await post('/api/mobile/auth/refresh', { refresh_token: refreshToken });
  return payload.session as DabbirSession;
}

export async function logout(accessToken: string): Promise<void> {
  await post('/api/mobile/auth/logout', {}, accessToken);
}

export async function loadRuntime(accessToken: string): Promise<any> {
  const response = await fetch(`${apiBase()}/api/mobile/runtime?summary=1`, {
    headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` },
  });
  const payload = await parseJson(response);
  syncBusinessProfile(payload);
  const countryCode = String(payload?.business?.country_code || '').toUpperCase();
  if (isGccCountryCode(countryCode)) await saveSelectedCountry(countryCode).catch(() => undefined);
  return payload;
}

export type DabbirBusinessType = 'store' | 'laundry' | 'car_wash';
export type DabbirLocale = `${'ar' | 'en'}-${GccCountryCode}`;
export type { GccCountryCode } from './country';

async function resolvedCountry(explicit?: GccCountryCode): Promise<GccCountryCode> {
  if (explicit && isGccCountryCode(explicit)) return explicit;
  return resolveSelectedCountry();
}

export async function createBusiness(accessToken: string, name: string, businessType: DabbirBusinessType, locale: DabbirLocale | 'ar-AE' | 'en-AE', countryCode?: GccCountryCode): Promise<any> {
  const resolved = await resolvedCountry(countryCode);
  const language = String(locale || '').toLowerCase().startsWith('en') ? 'en' : 'ar';
  const payload = await post('/api/mobile/runtime', { action: 'create_business', name, business_type: businessType, locale: `${language}-${resolved}`, country_code: resolved }, accessToken);
  syncBusinessProfile(payload);
  await saveSelectedCountry(resolved).catch(() => undefined);
  return payload;
}

export async function createStore(accessToken: string, name: string, locale: DabbirLocale | 'ar-AE' | 'en-AE', countryCode?: GccCountryCode): Promise<any> {
  const resolved = await resolvedCountry(countryCode);
  const language = String(locale || '').toLowerCase().startsWith('en') ? 'en' : 'ar';
  const payload = await post('/api/mobile/runtime', { action: 'create_business', name, business_type: 'store', locale: `${language}-${resolved}`, country_code: resolved }, accessToken);
  syncBusinessProfile(payload);
  await saveSelectedCountry(resolved).catch(() => undefined);
  return payload;
}

export async function deleteDabbirAccount(accessToken: string): Promise<any> {
  return post('/api/mobile/account-delete', { confirmation: 'DELETE_DABBIR_ACCOUNT' }, accessToken);
}

export async function verifyApplePurchase(accessToken: string, purchase: unknown): Promise<any> {
  return post('/api/mobile/iap/verify', { purchase }, accessToken);
}

export async function loadAppleEntitlement(accessToken: string): Promise<any> {
  const response = await fetch(`${apiBase()}/api/mobile/iap/status`, {
    headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` },
  });
  return parseJson(response);
}

export async function loadOwnerOperations(accessToken: string, businessId?: string | null): Promise<any> {
  const query = businessId ? `?business_id=${encodeURIComponent(businessId)}` : '';
  const response = await fetch(`${apiBase()}/api/mobile/owner-operations${query}`, {
    headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` },
  });
  const payload = await parseJson(response);
  syncBusinessProfile(payload);
  return payload;
}

export async function mutateOwnerOperations(accessToken: string, payload: Record<string, unknown>): Promise<any> {
  return post('/api/mobile/owner-operations', payload, accessToken);
}

export async function askOwnerCopilot(accessToken: string, businessId: string, message: string, language: 'ar' | 'en' = 'ar'): Promise<any> {
  return post('/api/mobile/owner-copilot', { business_id: businessId, message, language }, accessToken);
}
