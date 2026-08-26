const PROJECTS = new Set(['pilot_clinics', 'pilot_celebrities']);

function json(res, status, body) {
  res.status(status).setHeader('cache-control', 'no-store').json(body);
}

export function classifyClinicMessage(message = '') {
  const text = String(message).toLowerCase();
  if (/موعد|appointment|book|booking/.test(text)) return 'APPOINTMENT_REQUEST';
  if (/متابعة|follow.?up/.test(text)) return 'FOLLOW_UP';
  return 'GENERAL_INQUIRY';
}

export function classifyCelebrityMessage(message = '') {
  const text = String(message).toLowerCase();
  if (/اعلان|إعلان|advert|campaign|sponsor/.test(text)) return 'ADVERTISING_REQUEST';
  if (/تعاون|collab|collaboration/.test(text)) return 'COLLABORATION_REQUEST';
  if (/دعوة|invite|invitation|event/.test(text)) return 'INVITATION';
  if (/موعد|appointment|meeting/.test(text)) return 'APPOINTMENT_REQUEST';
  return 'GENERAL_REQUEST';
}

function syntheticResult(project, message) {
  if (project === 'pilot_clinics') {
    const classification = classifyClinicMessage(message);
    return {
      classification,
      workflow: classification === 'APPOINTMENT_REQUEST'
        ? ['CLASSIFY', 'APPOINTMENT', 'TASK', 'FOLLOW_UP']
        : ['CLASSIFY', 'TASK', 'FOLLOW_UP'],
      persisted: false
    };
  }

  const classification = classifyCelebrityMessage(message);
  return {
    classification,
    workflow: ['CLASSIFY', 'DEAL_OR_APPOINTMENT', 'TASK', 'FOLLOW_UP'],
    persisted: false
  };
}

export default async function handler(req, res) {
  if (process.env.VERCEL_ENV !== 'preview') {
    return json(res, 404, { ok: false, error: 'preview_only_runtime' });
  }

  const project = String(req.query?.project || req.body?.project || '').toLowerCase();
  if (!PROJECTS.has(project)) return json(res, 400, { ok: false, error: 'unsupported_project' });

  if (req.method === 'GET') {
    if (String(req.query?.synthetic || '') === '1') {
      const message = String(req.query?.message || '').slice(0, 2000);
      return json(res, 200, {
        ok: true,
        service: 'pilot-runtime',
        project,
        environment: 'PREVIEW_PILOT',
        data_mode: 'SYNTHETIC',
        result: syntheticResult(project, message),
        external_side_effects: false,
        payment_live: false,
        timestamp: new Date().toISOString()
      });
    }

    return json(res, 200, {
      ok: true,
      service: 'pilot-runtime',
      project,
      environment: 'PREVIEW_PILOT',
      data_mode: project === 'pilot_clinics' ? 'SYNTHETIC_ONLY_NO_PATIENT_DATA' : 'SYNTHETIC_ONLY',
      payment_live: false,
      external_channels: 'UNVERIFIED',
      timestamp: new Date().toISOString()
    });
  }

  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  if (req.body?.synthetic !== true) return json(res, 403, { ok: false, error: 'synthetic_mode_required' });

  const message = String(req.body?.message || '').slice(0, 2000);
  return json(res, 200, {
    ok: true,
    service: 'pilot-runtime',
    project,
    data_mode: 'SYNTHETIC',
    result: syntheticResult(project, message),
    external_side_effects: false,
    payment_live: false,
    timestamp: new Date().toISOString()
  });
}
