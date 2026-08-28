import * as SecureStore from 'expo-secure-store';

const SESSION_KEY = 'dabbir.session.v1';

export type DabbirSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
};

export async function loadSession(): Promise<DabbirSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DabbirSession>;
    if (!parsed.access_token || !parsed.refresh_token || !Number.isFinite(parsed.expires_at)) return null;
    return parsed as DabbirSession;
  } catch {
    return null;
  }
}

export async function saveSession(session: DabbirSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export function sessionNeedsRefresh(session: DabbirSession, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  return session.expires_at <= nowSeconds + 90;
}
