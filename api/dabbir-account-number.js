function getBearerToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match?.[1] || null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: 'authentication_required' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return res.status(503).json({ error: 'supabase_not_configured' });

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/dabbir_my_customer_no`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: '{}'
    });

    if (response.status === 401 || response.status === 403) {
      return res.status(401).json({ error: 'invalid_session' });
    }
    if (!response.ok) {
      return res.status(500).json({ error: 'account_number_lookup_failed' });
    }

    const customerNo = await response.json();
    if (!customerNo) return res.status(404).json({ error: 'dabbir_membership_not_found' });

    return res.status(200).json({ customer_no: customerNo });
  } catch {
    return res.status(503).json({ error: 'account_number_service_unavailable' });
  }
}
