import { getVercelOidcToken } from '@vercel/oidc';

const BROKER_URL = 'https://fphpoysqdsceniwduxjq.supabase.co/functions/v1/dabbir-vercel-runtime-broker';

export default async function handler(_req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  try {
    const token = await getVercelOidcToken();
    if (!token) return res.status(503).end(JSON.stringify({ ok: false, error: 'VERCEL_OIDC_UNAVAILABLE' }));
    const response = await fetch(BROKER_URL, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action: 'ping' }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok !== true) {
      return res.status(502).end(JSON.stringify({ ok: false, error: 'MUMBAI_BROKER_REJECTED', status: response.status }));
    }
    return res.status(200).end(JSON.stringify({
      ok: true,
      oidc_verified: true,
      target_ref: data.target_ref || null,
      environment: data.environment || null,
      credential_available: data.credential_available === true,
      secret_exposed: false,
    }));
  } catch (error) {
    return res.status(500).end(JSON.stringify({ ok: false, error: 'MUMBAI_PREFLIGHT_FAILED' }));
  }
}
