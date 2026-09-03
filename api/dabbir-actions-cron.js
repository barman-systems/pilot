import { json } from './_auth-core.js';
import { processWhatsAppAgentJobs } from './_dabbir-action-core.js';
import { cronAuthMode } from './salon-reminders-cron.js';

const clean = (value, max = 300) => String(value ?? '').trim().slice(0, max);

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET' });
  const authMode = cronAuthMode(req);
  if (!authMode) return json(res, 401, { ok: false, error: 'CRON_AUTH_REQUIRED' });

  try {
    const summary = await processWhatsAppAgentJobs({ delayMs: 0, limit: 20 });
    console.info('dabbir_actions_cron', {
      auth_mode: authMode,
      claimed: summary.claimed,
      completed: summary.completed,
      handoffs: summary.handoffs,
    });
    return json(res, 200, { ok: true, ...summary });
  } catch (error) {
    const code = clean(error?.code || error?.message || 'DABBIR_ACTIONS_CRON_FAILED', 160);
    console.error('dabbir_actions_cron_failed', { error: code });
    return json(res, 500, { ok: false, error: code });
  }
}
