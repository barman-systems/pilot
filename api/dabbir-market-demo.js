import { createHash } from 'node:crypto';
import { json, readJsonBody, requireSameOrigin } from './_auth-core.js';
import {
  buildCarWashReceipt,
  CAR_WASH_AI_COST_POLICY,
  CAR_WASH_DEMO_CATALOG,
  CAR_WASH_PERMISSIONS,
  findCarWashCapacity,
  parseCarWashInquiry,
  stableDemoIdentifiers,
  validateCarWashTransition,
} from './_dabbir-car-wash-killer-job.js';

const OPERATION_RE = /^[A-Za-z0-9:_-]{16,160}$/;
const buckets = new Map();
const clean = (value, max = 500) => String(value ?? '').trim().replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);
const hash = value => createHash('sha256').update(String(value)).digest('hex');

function clientKey(req) {
  const forwarded = clean(req.headers?.['x-forwarded-for'], 200).split(',')[0].trim();
  return hash(forwarded || clean(req.socket?.remoteAddress, 100) || 'unknown').slice(0, 24);
}

function allowRequest(req, now = Date.now()) {
  const key = clientKey(req);
  const active = (buckets.get(key) || []).filter(stamp => now - stamp < 10 * 60_000);
  if (active.length >= 20) return false;
  active.push(now);
  buckets.set(key, active);
  if (buckets.size > 2_000) buckets.clear();
  return true;
}

function transitionTrail({ startedAt, confidence }) {
  const permissions = Object.fromEntries(CAR_WASH_PERMISSIONS.map(permission => [permission, true]));
  const path = ['inquiry', 'qualified', 'offered', 'confirmed', 'assigned', 'reminded'];
  return path.slice(1).map((to, index) => {
    const from = path[index];
    const result = validateCarWashTransition({ from, to, actor: 'rule', permissions, operatorMode: 'demo', confidence });
    if (!result.ok) throw Object.assign(new Error(result.code), { status: 422 });
    return {
      from,
      to,
      actor: 'rule',
      permission: result.requiredPermission,
      at: new Date(startedAt.getTime() + (index + 1) * 120).toISOString(),
      evidence_ref: `sandbox:${to}`,
      external_result: ['confirmed', 'reminded'].includes(to) ? 'SANDBOX_DELIVERED' : 'INTERNAL_VERIFIED',
    };
  });
}

function demoCatalog() {
  return {
    business: { name: 'DABBIR Mobile Wash Demo', country: 'AE', currency: 'AED', timezone: 'Asia/Dubai' },
    areas: CAR_WASH_DEMO_CATALOG.areas.map(area => ({ key: area.key, name_ar: area.ar, name_en: area.en })),
    packages: CAR_WASH_DEMO_CATALOG.packages.map(item => ({
      key: item.key,
      name_ar: item.nameAr,
      name_en: item.nameEn,
      duration_minutes: item.durationMinutes,
      saloon_price_aed: item.prices.saloon,
      suv_price_aed: item.prices.suv,
    })),
    permissions: { READ: true, MESSAGE: true, QUOTE: true, BOOK: true, ASSIGN: true, REMIND: true, CHARGE: false },
    limits: CAR_WASH_AI_COST_POLICY,
    truth: {
      mode: 'SANDBOX',
      real_whatsapp_connected: false,
      real_customer_data_used: false,
      external_messages_sent: false,
      revenue_attribution_enabled: false,
    },
  };
}

export async function runMarketDemo(body, { now = new Date() } = {}) {
  const operationId = clean(body?.operation_id, 160);
  const message = clean(body?.message, 2_500);
  if (!OPERATION_RE.test(operationId)) throw Object.assign(new Error('VALID_OPERATION_ID_REQUIRED'), { status: 400 });
  if (message.length < 4) throw Object.assign(new Error('DEMO_MESSAGE_REQUIRED'), { status: 400 });
  const started = new Date(now);
  const inquiry = parseCarWashInquiry(message, { now: started });
  if (!inquiry.complete) {
    return {
      ok: true,
      state: 'needs_detail',
      question: inquiry.question,
      understood: {
        package: inquiry.package?.key || null,
        vehicle: inquiry.vehicle?.key || null,
        area: inquiry.area?.key || null,
        preferred_time: inquiry.preferredTime,
        confidence: inquiry.confidence,
      },
      missing: inquiry.missing,
      truth: demoCatalog().truth,
    };
  }

  const capacity = findCarWashCapacity({
    requestedAt: inquiry.preferredTime,
    durationMinutes: inquiry.package.durationMinutes,
    travelMinutes: 20,
    areaKey: inquiry.area.key,
    teams: [
      { id: 'demo-crew-pearl', name: inquiry.language === 'ar' ? 'فريق اللؤلؤ' : 'Crew Pearl', serviceAreas: CAR_WASH_DEMO_CATALOG.areas.map(area => area.key) },
      { id: 'demo-crew-falcon', name: inquiry.language === 'ar' ? 'فريق الصقر' : 'Crew Falcon', serviceAreas: ['dubai_marina', 'business_bay', 'downtown'] },
    ],
    bookings: [{
      teamId: 'demo-crew-pearl',
      status: 'confirmed',
      startsAt: inquiry.preferredTime,
      endsAt: new Date(new Date(inquiry.preferredTime).getTime() + 110 * 60_000).toISOString(),
    }],
    maxConcurrent: 2,
  });
  if (!capacity.ok) {
    return { ok: true, state: 'needs_detail', question: inquiry.language === 'ar' ? 'هذا الوقت ممتلئ. هل يناسبك الموعد التالي بعد 30 دقيقة؟' : 'That time is full. Would 30 minutes later work?', missing: ['capacity_confirmation'], understood: inquiry, truth: demoCatalog().truth };
  }

  const identifiers = stableDemoIdentifiers(`${operationId}:${hash(message)}`);
  const slot = capacity.slots[0];
  const price = inquiry.package.prices[inquiry.vehicle.key];
  const transitions = transitionTrail({ startedAt: started, confidence: inquiry.confidence.overall });
  const responseMs = Math.max(1, Date.now() - started.getTime());
  const receipt = buildCarWashReceipt({
    identifiers,
    inquiry,
    slot,
    transitions,
    bookingValue: price,
    responseMs,
    evidence: [
      { ref: 'sandbox:inbound', type: 'SIGNAL', verified: true, detail: 'Message accepted by the isolated demo endpoint.' },
      { ref: 'sandbox:capacity', type: 'DECISION', verified: true, detail: 'Team, duration and travel buffer checked.' },
      { ref: 'sandbox:booking', type: 'ACTION', verified: true, detail: 'Sandbox booking reserved with a deterministic idempotency fingerprint.' },
      { ref: 'sandbox:confirmation', type: 'EXTERNAL_RESULT', verified: true, detail: 'Confirmation and reminder rendered inside sandbox only.' },
    ],
  });
  return {
    ok: true,
    state: 'converted',
    message: inquiry.language === 'ar'
      ? `تم تحويل الاستفسار إلى حجز تجريبي بقيمة ${price} AED وتعيين ${slot.teamName}.`
      : `The inquiry became a ${price} AED sandbox booking assigned to ${slot.teamName}.`,
    booking: {
      id: identifiers.bookingId,
      status: 'reminded',
      package: inquiry.package.key,
      vehicle: inquiry.vehicle.key,
      area: inquiry.area.key,
      starts_at: slot.startsAt,
      ends_at: slot.endsAt,
      team: slot.teamName,
      price_aed: price,
    },
    receipt,
    truth: demoCatalog().truth,
  };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return json(res, 200, { ok: true, catalog: demoCatalog() });
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'GET, POST' });
    if (!requireSameOrigin(req)) return json(res, 403, { ok: false, error: 'ORIGIN_REQUIRED' });
    if (!allowRequest(req)) return json(res, 429, { ok: false, error: 'DEMO_RATE_LIMITED' }, { 'retry-after': '600' });
    const body = await readJsonBody(req, 12_000);
    return json(res, 200, await runMarketDemo(body));
  } catch (error) {
    const status = [400, 403, 405, 413, 422, 429].includes(Number(error?.status)) ? Number(error.status) : 500;
    console.error('dabbir_market_demo_failed', { status, error: clean(error?.message || error, 120) });
    return json(res, status, { ok: false, error: clean(error?.message || 'DEMO_FAILED', 120) });
  }
}
