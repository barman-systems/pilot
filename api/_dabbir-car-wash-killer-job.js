import { createHash } from 'node:crypto';

export const CAR_WASH_JOB_STATES = Object.freeze([
  'inquiry',
  'qualified',
  'offered',
  'confirmed',
  'assigned',
  'reminded',
  'completed',
  'paid',
  'lost',
]);

export const CAR_WASH_PERMISSIONS = Object.freeze([
  'READ',
  'MESSAGE',
  'QUOTE',
  'BOOK',
  'ASSIGN',
  'REMIND',
  'CHARGE',
]);

export const CAR_WASH_TRANSITIONS = Object.freeze({
  inquiry: Object.freeze(['qualified', 'lost']),
  qualified: Object.freeze(['offered', 'lost']),
  offered: Object.freeze(['confirmed', 'lost']),
  confirmed: Object.freeze(['assigned', 'lost']),
  assigned: Object.freeze(['reminded', 'completed', 'lost']),
  reminded: Object.freeze(['completed', 'lost']),
  completed: Object.freeze(['paid']),
  paid: Object.freeze([]),
  lost: Object.freeze([]),
});

export const CAR_WASH_AI_COST_POLICY = Object.freeze({
  targetMonthlyAed: 30,
  warningThresholds: Object.freeze([0.7, 0.9]),
  hardMonthlyAed: 60,
  deterministicFirst: true,
  maxAgentSteps: 4,
  providerTimeoutMs: 5_000,
});

const REQUIRED_PERMISSION = Object.freeze({
  qualified: 'READ',
  offered: 'QUOTE',
  confirmed: 'BOOK',
  assigned: 'ASSIGN',
  reminded: 'REMIND',
  paid: 'CHARGE',
});

const DEMO_AREAS = Object.freeze([
  Object.freeze({ key: 'dubai_marina', ar: 'دبي مارينا', en: 'Dubai Marina', tokens: ['دبي مارينا', 'مارينا', 'dubai marina', 'marina'] }),
  Object.freeze({ key: 'jvc', ar: 'قرية جميرا الدائرية', en: 'JVC', tokens: ['جي في سي', 'jvc', 'قرية جميرا'] }),
  Object.freeze({ key: 'business_bay', ar: 'الخليج التجاري', en: 'Business Bay', tokens: ['الخليج التجاري', 'business bay'] }),
  Object.freeze({ key: 'downtown', ar: 'وسط مدينة دبي', en: 'Downtown Dubai', tokens: ['داون تاون', 'وسط دبي', 'downtown'] }),
  Object.freeze({ key: 'al_barsha', ar: 'البرشاء', en: 'Al Barsha', tokens: ['البرشاء', 'barsha'] }),
]);

const DEMO_PACKAGES = Object.freeze([
  Object.freeze({ key: 'essential', nameAr: 'الغسيل الأساسي', nameEn: 'Essential wash', tokens: ['اساسي', 'أساسي', 'عادي', 'basic', 'essential'], durationMinutes: 60, prices: { saloon: 120, suv: 150 } }),
  Object.freeze({ key: 'premium', nameAr: 'الغسيل والتلميع', nameEn: 'Wash & polish', tokens: ['تلميع', 'بريميوم', 'بولش', 'polish', 'premium', 'detailing'], durationMinutes: 90, prices: { saloon: 180, suv: 220 } }),
]);

const clean = (value, max = 500) => String(value ?? '').trim().replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);
const normalizeArabic = value => clean(value, 4_000)
  .toLocaleLowerCase()
  .normalize('NFKD')
  .replace(/[\u064b-\u065f\u0670]/g, '')
  .replace(/[أإآ]/g, 'ا')
  .replace(/ة/g, 'ه');
const asciiDigits = value => String(value || '').replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const round2 = value => Math.round(Number(value || 0) * 100) / 100;

function includesAny(text, values) {
  return values.some(value => text.includes(normalizeArabic(value)));
}

function firstMatch(items, text) {
  return items.find(item => includesAny(text, item.tokens)) || null;
}

function vehicleFrom(text) {
  if (/(?:suv|4x4|دفع رباعي|ستيشن|جيب|كروس)/i.test(text)) return { key: 'suv', labelAr: 'دفع رباعي / SUV', labelEn: 'SUV' };
  if (/(?:saloon|sedan|صالون|سيدان|سياره صغيره|سيارة صغيرة)/i.test(text)) return { key: 'saloon', labelAr: 'صالون', labelEn: 'Saloon' };
  return null;
}

function preferredTimeFrom(text, now) {
  const source = asciiDigits(text);
  const timeMatch = source.match(/(?:^|\s)([01]?\d|2[0-3])(?::([0-5]\d))?\s*(am|pm|ص|م)?(?:\s|$)/i);
  const tomorrow = /(?:tomorrow|باجر|بكره|بكرة|غدا|غداً)/i.test(source);
  const today = /(?:today|اليوم)/i.test(source);
  if (!timeMatch || (!tomorrow && !today)) return null;
  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] || 0);
  const marker = String(timeMatch[3] || '').toLowerCase();
  if ((marker === 'pm' || marker === 'م') && hour < 12) hour += 12;
  if ((marker === 'am' || marker === 'ص') && hour === 12) hour = 0;
  const requested = new Date(now);
  requested.setUTCDate(requested.getUTCDate() + (tomorrow ? 1 : 0));
  // Demo and first vertical are UAE-only. Database execution uses the tenant timezone.
  requested.setUTCHours(hour - 4, minute, 0, 0);
  if (!tomorrow && requested <= now) return null;
  return requested;
}

function confidenceFor(value, explicit = true) {
  return value ? (explicit ? 0.98 : 0.82) : 0;
}

function oneMissingQuestion(missing, language = 'ar') {
  const ar = language !== 'en';
  const questions = {
    package: ar ? 'أي باقة تريد: الغسيل الأساسي أم الغسيل والتلميع؟' : 'Which package would you like: Essential wash or Wash & polish?',
    vehicle: ar ? 'هل السيارة صالون أم SUV؟' : 'Is the vehicle a saloon or an SUV?',
    area: ar ? 'في أي منطقة ستكون السيارة؟' : 'Which area will the vehicle be in?',
    preferred_time: ar ? 'ما اليوم والوقت المناسبان لك؟' : 'What day and time work for you?',
  };
  return questions[missing] || (ar ? 'ما المعلومة الناقصة لإكمال الحجز؟' : 'What missing detail should I use to complete the booking?');
}

export function parseCarWashInquiry(message, { now = new Date(), areas = DEMO_AREAS, packages = DEMO_PACKAGES } = {}) {
  const original = clean(message, 2_500);
  const text = normalizeArabic(original);
  const language = /[\u0600-\u06ff]/.test(original) ? 'ar' : 'en';
  const selectedPackage = firstMatch(packages, text);
  const vehicle = vehicleFrom(text);
  const area = firstMatch(areas, text);
  const preferredTime = preferredTimeFrom(text, now);
  const missing = [
    ['package', selectedPackage],
    ['vehicle', vehicle],
    ['area', area],
    ['preferred_time', preferredTime],
  ].filter(([, value]) => !value).map(([key]) => key);
  const fieldConfidence = {
    package: confidenceFor(selectedPackage),
    vehicle: confidenceFor(vehicle),
    area: confidenceFor(area),
    preferred_time: confidenceFor(preferredTime),
  };
  const overallConfidence = round2(Object.values(fieldConfidence).reduce((sum, value) => sum + value, 0) / 4);
  return {
    language,
    source: 'deterministic_vertical_parser_v1',
    package: selectedPackage,
    vehicle,
    area,
    preferredTime: preferredTime?.toISOString() || null,
    missing,
    question: missing.length ? oneMissingQuestion(missing[0], language) : null,
    confidence: { overall: overallConfidence, fields: fieldConfidence },
    complete: missing.length === 0 && overallConfidence >= 0.9,
  };
}

export function validateCarWashTransition({
  from,
  to,
  actor = 'rule',
  permissions = {},
  operatorMode = 'controlled_live',
  killSwitch = false,
  confidence = 1,
  confidenceThreshold = 0.9,
  reason = '',
  ownerOverride = false,
} = {}) {
  const current = clean(from, 30).toLowerCase();
  const next = clean(to, 30).toLowerCase();
  const actorType = clean(actor, 20).toLowerCase();
  if (!CAR_WASH_JOB_STATES.includes(current) || !CAR_WASH_JOB_STATES.includes(next)) return { ok: false, code: 'INVALID_JOB_STATE' };
  if (current === next) return { ok: true, replay: true, from: current, to: next };
  if (killSwitch && ['rule', 'ai'].includes(actorType)) return { ok: false, code: 'KILL_SWITCH_ACTIVE' };
  if (operatorMode === 'shadow' && ['rule', 'ai'].includes(actorType) && ['confirmed', 'assigned', 'reminded', 'completed', 'paid'].includes(next)) {
    return { ok: false, code: 'SHADOW_MODE_NO_EXTERNAL_ACTION' };
  }
  if (ownerOverride) {
    if (actorType !== 'human' || clean(reason, 500).length < 3) return { ok: false, code: 'OWNER_OVERRIDE_REASON_REQUIRED' };
    return { ok: true, override: true, from: current, to: next };
  }
  if (!CAR_WASH_TRANSITIONS[current].includes(next)) return { ok: false, code: 'ILLEGAL_JOB_TRANSITION' };
  const required = REQUIRED_PERMISSION[next];
  if (required && permissions[required] !== true && ['rule', 'ai'].includes(actorType)) return { ok: false, code: `PERMISSION_${required}_REQUIRED` };
  if (actorType === 'ai' && Number(confidence) < Number(confidenceThreshold)) return { ok: false, code: 'LOW_CONFIDENCE_HUMAN_ESCALATION' };
  if (next === 'lost' && clean(reason, 500).length < 3) return { ok: false, code: 'LOST_REASON_REQUIRED' };
  return { ok: true, from: current, to: next, requiredPermission: required || null };
}

function minutes(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : NaN;
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function localParts(value, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const pick = type => parts.find(part => part.type === type)?.value || '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(pick('weekday'));
  return { weekday, minuteOfDay: Number(pick('hour')) * 60 + Number(pick('minute')) };
}

export function findCarWashCapacity({
  requestedAt,
  durationMinutes,
  travelMinutes = 20,
  areaKey,
  teams = [],
  bookings = [],
  timezone = 'Asia/Dubai',
  workingDays = [0, 1, 2, 3, 4, 5, 6],
  openMinute = 8 * 60,
  closeMinute = 20 * 60,
  maxConcurrent = 1,
  slotIntervalMinutes = 30,
  candidates = 12,
} = {}) {
  const initial = minutes(requestedAt);
  const duration = Math.max(15, Number(durationMinutes) || 60);
  const travel = Math.max(0, Number(travelMinutes) || 0);
  if (!Number.isFinite(initial)) return { ok: false, code: 'VALID_REQUESTED_TIME_REQUIRED', slots: [] };
  const activeTeams = teams.filter(team => team?.active !== false && (!Array.isArray(team.serviceAreas) || !team.serviceAreas.length || team.serviceAreas.includes(areaKey)));
  const teamPool = activeTeams.length ? activeTeams : [{ id: null, name: null, active: true, serviceAreas: [] }];
  const slots = [];
  for (let offset = 0; offset <= candidates && slots.length < 3; offset += 1) {
    const start = initial + offset * slotIntervalMinutes * 60_000;
    const end = start + (duration + travel) * 60_000;
    const localStart = localParts(start, timezone);
    const localEnd = localParts(end, timezone);
    if (!workingDays.includes(localStart.weekday) || localStart.weekday !== localEnd.weekday || localStart.minuteOfDay < openMinute || localEnd.minuteOfDay > closeMinute) continue;
    const concurrent = bookings.filter(booking => !['cancelled', 'lost'].includes(String(booking.status || '').toLowerCase()) && overlaps(start, end, minutes(booking.startsAt), minutes(booking.endsAt))).length;
    if (concurrent >= Math.max(1, Number(maxConcurrent) || 1)) continue;
    const team = teamPool.find(candidate => !bookings.some(booking => candidate.id && booking.teamId === candidate.id && !['cancelled', 'lost'].includes(String(booking.status || '').toLowerCase()) && overlaps(start, end, minutes(booking.startsAt), minutes(booking.endsAt))));
    if (!team) continue;
    slots.push({
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(start + duration * 60_000).toISOString(),
      capacityEndsAt: new Date(end).toISOString(),
      teamId: team.id,
      teamName: team.name,
      timezone,
    });
  }
  return { ok: slots.length > 0, code: slots.length ? null : 'NO_CAPACITY', slots };
}

export function stableDemoIdentifiers(operationId) {
  const digest = hash(clean(operationId, 160));
  const uuid = offset => `${digest.slice(offset, offset + 8)}-${digest.slice(offset + 8, offset + 12)}-4${digest.slice(offset + 13, offset + 16)}-a${digest.slice(offset + 17, offset + 20)}-${digest.slice(offset + 20, offset + 32)}`;
  return { jobId: uuid(0), bookingId: uuid(8), receiptId: `demo_${digest.slice(0, 24)}` };
}

export function buildCarWashReceipt({
  identifiers,
  inquiry,
  slot,
  transitions,
  bookingValue,
  currency = 'AED',
  responseMs,
  externalChannel = 'SANDBOX',
  deliveryVerified = true,
  amountPaid = 0,
  recovered = false,
  evidence = [],
} = {}) {
  const value = round2(bookingValue);
  const paid = round2(amountPaid);
  return {
    id: identifiers.receiptId,
    job_id: identifiers.jobId,
    booking_id: identifiers.bookingId,
    auditability: 'STEP_LEVEL_EVIDENCE',
    channel: externalChannel,
    external_side_effects: externalChannel !== 'SANDBOX',
    received: inquiry,
    understood: {
      package: inquiry.package?.key || null,
      vehicle: inquiry.vehicle?.key || null,
      area: inquiry.area?.key || null,
      preferred_time: inquiry.preferredTime,
      confidence: inquiry.confidence,
    },
    decision: { selected_slot: slot?.startsAt || null, selected_team: slot?.teamName || null, policy: 'vertical_capacity_v1' },
    execution: {
      state: transitions.at(-1)?.to || 'inquiry',
      transitions,
      confirmation: deliveryVerified ? 'VERIFIED_IN_CHANNEL' : 'PENDING_DELIVERY',
      reminder: deliveryVerified ? 'VERIFIED_IN_CHANNEL' : 'PENDING_DELIVERY',
    },
    outcome: {
      booking_value: { amount: value, currency, classification: 'ESTIMATED' },
      verified_revenue: { amount: paid, currency, classification: paid > 0 ? 'VERIFIED' : 'NOT_VERIFIED' },
      recovered_revenue: { amount: recovered && paid > 0 ? paid : 0, currency, classification: recovered && paid > 0 ? 'RECOVERED' : 'NOT_CLAIMED' },
      lost_revenue: { amount: 0, currency, classification: 'NOT_LOST' },
      attribution: recovered && paid > 0 ? 'prior_abandonment_followed_by_verified_payment' : 'booking_created_in_current_session',
    },
    response_ms: Math.max(0, Math.trunc(Number(responseMs) || 0)),
    evidence,
  };
}

export const CAR_WASH_DEMO_CATALOG = Object.freeze({ areas: DEMO_AREAS, packages: DEMO_PACKAGES });
