import {
  completeTikTokOAuth,
  exchangeTikTokAuthCode,
  findConnectionByState,
  markTikTokFailure,
  tiktokPilotConfig,
} from './_tiktok-pilot-core.js';

function clean(value, max = 4000) {
  return String(value || '').trim().slice(0, max);
}

function redirect(res, query) {
  res.statusCode = 302;
  res.setHeader('cache-control', 'no-store');
  res.setHeader('location', `/api/dabbir-tiktok-pilot?${query}`);
  res.end();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('allow', 'GET');
    return res.end('METHOD_NOT_ALLOWED');
  }

  let state = '';
  let authCode = '';
  let providerError = '';
  try {
    const url = new URL(String(req.url || '/'), 'https://dabbir.invalid');
    state = clean(url.searchParams.get('state'), 512);
    authCode = clean(url.searchParams.get('auth_code'), 2048);
    providerError = clean(url.searchParams.get('error') || url.searchParams.get('error_description'), 160);
  } catch {
    return redirect(res, 'error=TIKTOK_CALLBACK_INVALID');
  }

  if (!state) return redirect(res, 'error=TIKTOK_STATE_REQUIRED');

  let connection = null;
  try {
    connection = await findConnectionByState(state);
    if (!connection) return redirect(res, 'error=TIKTOK_STATE_INVALID_OR_EXPIRED');

    if (providerError) {
      await markTikTokFailure(connection.business_id, 'TIKTOK_AUTHORIZATION_DENIED');
      return redirect(res, 'error=TIKTOK_AUTHORIZATION_DENIED');
    }
    if (!authCode) {
      await markTikTokFailure(connection.business_id, 'TIKTOK_AUTH_CODE_REQUIRED');
      return redirect(res, 'error=TIKTOK_AUTH_CODE_REQUIRED');
    }

    const config = tiktokPilotConfig(req);
    if (!config.ready) {
      await markTikTokFailure(connection.business_id, 'TIKTOK_APP_NOT_CONFIGURED');
      return redirect(res, 'error=TIKTOK_APP_NOT_CONFIGURED');
    }

    const exchanged = await exchangeTikTokAuthCode(config, authCode);
    const completed = await completeTikTokOAuth({
      connection,
      config,
      tokenData: exchanged.data,
      providerStatus: exchanged.providerStatus,
    });
    const scopes = clean(completed?.granted_scopes, 4000).split(',').map(item => item.trim()).filter(Boolean);
    const messagingReady = ['message.list.read', 'message.list.send', 'message.list.manage'].every(scope => scopes.includes(scope));
    return redirect(res, messagingReady ? 'connected=1' : 'connected=1&warning=TIKTOK_MESSAGING_SCOPES_INCOMPLETE');
  } catch (error) {
    if (connection?.business_id) {
      await markTikTokFailure(
        connection.business_id,
        String(error?.message || 'TIKTOK_CALLBACK_FAILED').slice(0, 160),
        error?.providerStatus,
      );
    }
    return redirect(res, `error=${encodeURIComponent(String(error?.message || 'TIKTOK_CALLBACK_FAILED').slice(0, 160))}`);
  }
}
