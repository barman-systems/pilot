import { createHash } from 'node:crypto';

const PWNED_PASSWORDS_RANGE = 'https://api.pwnedpasswords.com/range';
const DEFAULT_TIMEOUT_MS = 2500;

function unavailableError(cause) {
  const error = new Error('PASSWORD_BREACH_CHECK_UNAVAILABLE');
  error.code = 'PASSWORD_BREACH_CHECK_UNAVAILABLE';
  if (cause) error.cause = cause;
  return error;
}

export function passwordHashRange(password) {
  const raw = String(password || '');
  const sha1 = createHash('sha1').update(raw, 'utf8').digest('hex').toUpperCase();
  return { prefix: sha1.slice(0, 5), suffix: sha1.slice(5) };
}

export async function checkPasswordCompromise(password, { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const raw = String(password || '');
  if (!raw || raw.length > 256) throw unavailableError();
  if (typeof fetchImpl !== 'function') throw unavailableError();

  const { prefix, suffix } = passwordHashRange(raw);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(250, Math.min(Number(timeoutMs) || DEFAULT_TIMEOUT_MS, 5000)));

  try {
    const response = await fetchImpl(`${PWNED_PASSWORDS_RANGE}/${prefix}`, {
      method: 'GET',
      headers: {
        'user-agent': 'DABBIR-password-security/1.0',
        'add-padding': 'true',
      },
      signal: controller.signal,
    });
    if (!response?.ok) throw unavailableError();

    const body = await response.text();
    for (const line of String(body || '').split(/\r?\n/)) {
      const [candidate, countText] = line.trim().split(':', 2);
      if (!candidate || candidate.toUpperCase() !== suffix) continue;
      const count = Number.parseInt(countText || '0', 10);
      return { compromised: Number.isFinite(count) && count > 0, count: Number.isFinite(count) ? count : 0, source: 'HIBP_PWNED_PASSWORDS' };
    }
    return { compromised: false, count: 0, source: 'HIBP_PWNED_PASSWORDS' };
  } catch (error) {
    if (error?.code === 'PASSWORD_BREACH_CHECK_UNAVAILABLE') throw error;
    throw unavailableError(error);
  } finally {
    clearTimeout(timer);
  }
}
