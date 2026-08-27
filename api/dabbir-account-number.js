import { createClient } from '@supabase/supabase-js';

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

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data, error } = await supabase.rpc('dabbir_my_customer_no');
  if (error) return res.status(500).json({ error: 'account_number_lookup_failed' });
  if (!data) return res.status(404).json({ error: 'dabbir_membership_not_found' });

  return res.status(200).json({ customer_no: data });
}
