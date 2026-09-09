import { timingSafeEqual } from 'node:crypto';
import { json } from './_auth-core.js';
import { runDailyOperatorBatch } from './_dabbir-daily-operator-core.js';

export const DAILY_OPERATOR_SCHEDULE = '15 5 * * *';

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
function sameSecret(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export function cronAuthMode(req, env = process.env) {
  const secret = clean(env.CRON_SECRET, 4096);
  const authorization = clean(req.headers?.authorization, 8192);
  if (secret) return sameSecret(authorization, `Bearer ${secret}`) ? 'secret' : null;
  const production = clean(env.VERCEL_ENV, 32) === 'production';
  const agent = clean(req.headers?.['user-agent'], 120).toLowerCase();
  const schedule = clean(req.headers?.['x-vercel-cron-schedule'], 120);
  return production && agent === 'vercel-cron/1.0' && schedule === DAILY_OPERATOR_SCHEDULE ? 'vercel_schedule' : null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET' });
  const authMode = cronAuthMode(req);
  if (!authMode) return json(res, 401, { ok: false, error: 'CRON_AUTH_REQUIRED' });
  try {
    const summary = await runDailyOperatorBatch();
    console.info('dabbir_daily_business_operator', { auth_mode: authMode, ...summary });
    return json(res, 200, summary);
  } catch (error) {
    const message = clean(error?.message || error, 300);
    console.error('dabbir_daily_business_operator_failed', { error: message });
    return json(res, 500, { ok: false, error: message });
  }
}
