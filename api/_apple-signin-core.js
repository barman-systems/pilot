import { createPrivateKey, sign as signPayload } from 'node:crypto';

const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const APPLE_ISSUER = 'https://appleid.apple.com';
const DEFAULT_TIMEOUT_MS = Math.max(3000, Number(process.env.DABBIR_APPLE_SIGN_IN_TIMEOUT_MS || 10000));

function appleError(message, code = 503) {
  return Object.assign(new Error(message), { code });
}

function requiredEnv(name, max = 8192) {
  const value = String(process.env[name] || '').trim();
  if (!value || value.length > max) throw appleError(`${name}_NOT_CONFIGURED`, 503);
  return value;
}

function privateKeyPem() {
  const encoded = String(process.env.DABBIR_APPLE_SIGN_IN_PRIVATE_KEY_BASE64 || '').trim();
  const raw = encoded
    ? Buffer.from(encoded, 'base64').toString('utf8')
    : String(process.env.DABBIR_APPLE_SIGN_IN_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  if (!raw || raw.length > 16384 || !raw.includes('PRIVATE KEY')) {
    throw appleError('DABBIR_APPLE_SIGN_IN_PRIVATE_KEY_NOT_CONFIGURED', 503);
  }
  return raw;
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeJwtPayload(value) {
  try {
    const parts = String(value || '').split('.');
    if (parts.length !== 3 || !parts[1]) return null;
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function signInClientId() {
  const value = requiredEnv('DABBIR_IOS_BUNDLE_ID', 255);
  if (!/^[A-Za-z0-9.-]{3,255}$/.test(value)) throw appleError('DABBIR_IOS_BUNDLE_ID_INVALID', 503);
  return value;
}

export function createAppleClientSecret(nowSeconds = Math.floor(Date.now() / 1000)) {
  const teamId = requiredEnv('DABBIR_APPLE_SIGN_IN_TEAM_ID', 64);
  const keyId = requiredEnv('DABBIR_APPLE_SIGN_IN_KEY_ID', 64);
  if (!/^[A-Za-z0-9]{5,64}$/.test(teamId)) throw appleError('DABBIR_APPLE_SIGN_IN_TEAM_ID_INVALID', 503);
  if (!/^[A-Za-z0-9]{5,64}$/.test(keyId)) throw appleError('DABBIR_APPLE_SIGN_IN_KEY_ID_INVALID', 503);

  const clientId = signInClientId();
  const header = base64urlJson({ alg: 'ES256', kid: keyId, typ: 'JWT' });
  const payload = base64urlJson({
    iss: teamId,
    iat: nowSeconds,
    exp: nowSeconds + 300,
    aud: APPLE_ISSUER,
    sub: clientId,
  });
  const signingInput = `${header}.${payload}`;
  let key;
  try {
    key = createPrivateKey(privateKeyPem());
  } catch {
    throw appleError('DABBIR_APPLE_SIGN_IN_PRIVATE_KEY_INVALID', 503);
  }
  const signature = signPayload('sha256', Buffer.from(signingInput), {
    key,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return `${signingInput}.${signature}`;
}

async function appleFormPost(url, values) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(values).toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch {
    throw appleError('APPLE_SIGN_IN_SERVER_UNAVAILABLE', 503);
  }
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  return { response, payload };
}

export function appleIdentitySubject(authUser) {
  const identities = Array.isArray(authUser?.identities) ? authUser.identities : [];
  const identity = identities.find(item => String(item?.provider || '').toLowerCase() === 'apple') || null;
  const providers = Array.isArray(authUser?.app_metadata?.providers)
    ? authUser.app_metadata.providers.map(value => String(value).toLowerCase())
    : [];
  const hasApple = Boolean(identity) || providers.includes('apple') || String(authUser?.app_metadata?.provider || '').toLowerCase() === 'apple';
  if (!hasApple) return null;
  const subject = String(identity?.identity_data?.sub || identity?.provider_id || '').trim();
  if (!subject || subject.length > 255) throw appleError('APPLE_IDENTITY_SUBJECT_UNAVAILABLE', 503);
  return subject;
}

export async function revokeAppleAuthorizationForDeletion(authorizationCode, expectedSubject) {
  const code = String(authorizationCode || '').trim();
  const expected = String(expectedSubject || '').trim();
  if (code.length < 10 || code.length > 4096) throw appleError('APPLE_REAUTHORIZATION_CODE_REQUIRED', 409);
  if (!expected || expected.length > 255) throw appleError('APPLE_IDENTITY_SUBJECT_UNAVAILABLE', 503);

  const clientId = signInClientId();
  const clientSecret = createAppleClientSecret();
  const exchanged = await appleFormPost(APPLE_TOKEN_URL, {
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
  });
  if (!exchanged.response.ok) {
    const detail = String(exchanged.payload?.error || '').toLowerCase();
    if (detail === 'invalid_grant') throw appleError('APPLE_REAUTHORIZATION_INVALID', 409);
    throw appleError('APPLE_TOKEN_EXCHANGE_FAILED', 503);
  }

  const refreshToken = String(exchanged.payload?.refresh_token || '').trim();
  const idToken = String(exchanged.payload?.id_token || '').trim();
  const identity = decodeJwtPayload(idToken);
  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(identity?.aud) ? identity.aud.map(String) : [String(identity?.aud || '')];
  if (
    !refreshToken
    || refreshToken.length > 8192
    || String(identity?.iss || '') !== APPLE_ISSUER
    || !audiences.includes(clientId)
    || String(identity?.sub || '') !== expected
    || Number(identity?.exp || 0) <= now
  ) {
    throw appleError('APPLE_REAUTHORIZATION_IDENTITY_MISMATCH', 403);
  }

  const revoked = await appleFormPost(APPLE_REVOKE_URL, {
    client_id: clientId,
    client_secret: clientSecret,
    token: refreshToken,
    token_type_hint: 'refresh_token',
  });
  if (!revoked.response.ok) throw appleError('APPLE_TOKEN_REVOCATION_FAILED', 503);
  return { revoked: true };
}
