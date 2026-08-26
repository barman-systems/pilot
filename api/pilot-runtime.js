const PROJECTS = new Set(['pilot_clinics', 'pilot_celebrities']);

function json(res, status, body) {
  res.status(status).setHeader('cache-control', 'no-store').json(body);
}

function normalizeArabic(input = '') {
  return String(input)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/[^\p{L}\p{N}\s:+\-./]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsAny(text, terms) {
  return terms.some(term => text.includes(term));
}

export function extractClinicSignals(message = '') {
  const text = normalizeArabic(message);
  const temporal = [];

  if (containsAny(text, ['عقب باجر', 'بعد بكره', 'بعد بكرة', 'day after tomorrow'])) temporal.push('DAY_AFTER_TOMORROW');
  else if (containsAny(text, ['باجر', 'بكره', 'بكرة', 'غدا', 'غد', 'tomorrow'])) temporal.push('TOMORROW');
  else if (containsAny(text, ['اليوم', 'today'])) temporal.push('TODAY');

  if (containsAny(text, ['الصبح', 'صباح', 'morning'])) temporal.push('MORNING');
  if (containsAny(text, ['الظهر', 'ظهرا', 'noon'])) temporal.push('NOON');
  if (containsAny(text, ['العصر', 'afternoon'])) temporal.push('AFTERNOON');
  if (containsAny(text, ['المغرب', 'المسا', 'مساء', 'evening'])) temporal.push('EVENING');
  if (containsAny(text, ['الليل', 'ليلا', 'night'])) temporal.push('NIGHT');

  const appointmentTerms = ['موعد', 'حجز', 'احجز', 'appointment', 'book', 'booking', 'slot', 'availability'];
  let intent = 'GENERAL_INQUIRY';
  if (containsAny(text, ['الغاء', 'الغي', 'الغيه', 'كنسل', 'cancel'])) intent = 'CANCEL_APPOINTMENT';
  else if (containsAny(text, ['اغير', 'غير', 'تغيير', 'بدل', 'انقل', 'move', 'reschedule', 'change']) && containsAny(text, appointmentTerms)) intent = 'RESCHEDULE_APPOINTMENT';
  else if (containsAny(text, appointmentTerms)) intent = 'APPOINTMENT_REQUEST';
  else if (containsAny(text, ['متابعه', 'راجع', 'follow-up', 'follow up', 'followup'])) intent = 'FOLLOW_UP';
  else if (containsAny(text, ['موقع', 'لوكيشن', 'عنوان', 'location', 'address', 'map'])) intent = 'LOCATION_REQUEST';
  else if (containsAny(text, ['دوام', 'تفتحون', 'تسكرون', 'ساعات', 'hours', 'opening', 'closing', 'open', 'close'])) intent = 'BUSINESS_HOURS';

  return { intent, temporal, normalized: text };
}

export function classifyClinicMessage(message = '') {
  return extractClinicSignals(message).intent;
}

export function classifyCelebrityMessage(message = '') {
  const text = normalizeArabic(message);
  if (containsAny(text, ['اعلان', 'advert', 'campaign', 'sponsor'])) return 'ADVERTISING_REQUEST';
  if (containsAny(text, ['تعاون', 'collab', 'collaboration'])) return 'COLLABORATION_REQUEST';
  if (containsAny(text, ['دعوه', 'invite', 'invitation', 'event'])) return 'INVITATION';
  if (containsAny(text, ['موعد', 'appointment', 'meeting'])) return 'APPOINTMENT_REQUEST';
  return 'GENERAL_REQUEST';
}

function clinicWorkflow(intent) {
  switch (intent) {
    case 'APPOINTMENT_REQUEST': return ['CLASSIFY', 'CHECK_AVAILABILITY', 'PROPOSE_SLOT', 'TASK', 'FOLLOW_UP'];
    case 'RESCHEDULE_APPOINTMENT': return ['CLASSIFY', 'VERIFY_EXISTING_BOOKING', 'CHECK_AVAILABILITY', 'PROPOSE_CHANGE', 'TASK', 'FOLLOW_UP'];
    case 'CANCEL_APPOINTMENT': return ['CLASSIFY', 'VERIFY_EXISTING_BOOKING', 'PROPOSE_CANCELLATION', 'TASK', 'FOLLOW_UP'];
    case 'LOCATION_REQUEST': return ['CLASSIFY', 'VERIFY_LOCATION', 'RESPOND'];
    case 'BUSINESS_HOURS': return ['CLASSIFY', 'VERIFY_BUSINESS_HOURS', 'RESPOND'];
    default: return ['CLASSIFY', 'TASK', 'FOLLOW_UP'];
  }
}

function syntheticResult(project, message) {
  if (project === 'pilot_clinics') {
    const understanding = extractClinicSignals(message);
    return {
      classification: understanding.intent,
      understanding: { temporal: understanding.temporal },
      workflow: clinicWorkflow(understanding.intent),
      authoritative_actions_executed: false,
      persisted: false
    };
  }

  const classification = classifyCelebrityMessage(message);
  return {
    classification,
    workflow: ['CLASSIFY', 'DEAL_OR_APPOINTMENT', 'TASK', 'FOLLOW_UP'],
    authoritative_actions_executed: false,
    persisted: false
  };
}

export default async function handler(req, res) {
  if (process.env.VERCEL_ENV !== 'preview') return json(res, 404, { ok: false, error: 'preview_only_runtime' });

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
