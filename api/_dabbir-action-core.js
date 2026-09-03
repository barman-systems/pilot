import { createHash } from 'node:crypto';
import { generateDABBIRAiReply } from './_ai-core.js';
import {
  finalizeOutboundReply,
  markOutboundResult,
  sendMetaText,
  serviceRpc,
} from './_whatsapp-live-core.js';
import { loadBusinessConnectionWithServiceKey } from './_whatsapp-service-connection.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
const clean = (value, max = 4000) => String(value ?? '').trim().slice(0, max);
const one = value => Array.isArray(value) ? value[0] ?? null : value ?? null;
const asArray = value => Array.isArray(value) ? value : [];
const ARABIC = /[\u0600-\u06ff]/;
const HUMAN_REQUEST = /(?:\b(?:human|agent|person|staff|employee|manager|owner)\b|موظف(?:ة)?|شخص حقيقي|انسان|إنسان|بشر|المالك|المدير|اكلم احد|أكلم أحد|حولني|حوّلني)/i;
const CONFIRM_BOOKING = /(?:^|\s)(?:نعم|اي|إي|ايوه|أيوه|تمام|اوكي|أوكي|أكد|اكد|احجز|حجز|yes|ok|okay|confirm|book)(?:\s|$)|(?:الأول|الاول|الثاني|الثالث|first|second|third)/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;

function serviceKey() {
  return clean(process.env.SUPABASE_SERVICE_ROLE_KEY, 8192);
}

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function latestCustomerText(context) {
  const messages = asArray(context?.messages);
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.sender === 'customer') return clean(messages[i]?.body, 2000);
  }
  return '';
}

function languageOf(text) {
  return ARABIC.test(String(text || '')) ? 'ar' : 'en';
}

function selectionIndex(text) {
  const value = clean(text, 300).toLowerCase();
  if (/(?:الأول|الاول|\bfirst\b|^\s*1\s*$)/i.test(value)) return 0;
  if (/(?:الثاني|\bsecond\b|^\s*2\s*$)/i.test(value)) return 1;
  if (/(?:الثالث|\bthird\b|^\s*3\s*$)/i.test(value)) return 2;
  return null;
}

function parseDecision(raw) {
  const text = clean(raw, 4000).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const action = clean(parsed.action, 40).toUpperCase();
    if (!['REPLY', 'CHECK_AVAILABILITY', 'CREATE_BOOKING', 'HANDOFF'].includes(action)) return null;
    return {
      action,
      reply: clean(parsed.reply, 1600),
      serviceName: clean(parsed.service_name, 180) || null,
      workerName: clean(parsed.worker_name, 180) || null,
      requestedLocal: LOCAL_ISO.test(clean(parsed.requested_local, 40)) ? clean(parsed.requested_local, 40) : null,
      selectedSlotIndex: Number.isInteger(Number(parsed.selected_slot_index)) ? Number(parsed.selected_slot_index) - 1 : null,
      routeClass: clean(parsed.route_class, 40).toUpperCase() || 'SUPPORT',
    };
  } catch {
    return null;
  }
}

function canonicalName(items, requested) {
  const wanted = clean(requested, 180).toLocaleLowerCase();
  if (!wanted) return null;
  for (const item of asArray(items)) {
    for (const candidate of [item?.name, item?.name_ar, item?.name_en]) {
      if (clean(candidate, 180).toLocaleLowerCase() === wanted) return clean(candidate, 180);
    }
  }
  return requested;
}

function plannerContext(context) {
  return JSON.stringify({
    business: context?.business || {},
    customer: { name: context?.customer?.name || null },
    services: asArray(context?.services).slice(0, 30),
    workers: asArray(context?.workers).slice(0, 30),
    products: asArray(context?.products).slice(0, 40),
    runtime: context?.runtime || {},
  });
}

async function decide(context) {
  const userText = latestCustomerText(context);
  const plannerPrompt = [
    'You are the DABBIR action planner. Return ONLY one minified JSON object; no markdown.',
    'Allowed actions: REPLY, CHECK_AVAILABILITY, CREATE_BOOKING, HANDOFF.',
    'Schema: {"action":"...","reply":"...","service_name":null,"worker_name":null,"requested_local":null,"selected_slot_index":null,"route_class":"SUPPORT"}',
    'Use only names, prices and facts in VERIFIED BUSINESS CONTEXT.',
    'For a booking request with an exact date and time, choose CHECK_AVAILABILITY and convert the requested local time to YYYY-MM-DDTHH:MM:SS using business.current_local_time and business.timezone.',
    'If date/time is ambiguous or the customer only gives a broad daypart, do not guess: use REPLY to ask the shortest necessary question.',
    'Only choose CREATE_BOOKING when the customer explicitly confirms one of runtime.offered_slots. selected_slot_index is 1-based.',
    'If the customer asks for a human, choose HANDOFF.',
    'For normal questions choose REPLY and answer concisely from verified context.',
    `CUSTOMER_MESSAGE=${JSON.stringify(userText)}`,
  ].join('\n');

  const ai = await generateDABBIRAiReply({
    project: 'dabbir_businesses',
    message: plannerPrompt,
    language: languageOf(userText),
    businessContext: plannerContext(context),
    history: [],
  });
  if (!ai?.ok || !clean(ai?.reply)) {
    const error = new Error(clean(ai?.error, 160) || 'AI_ACTION_PLANNER_UNAVAILABLE');
    error.code = error.message;
    throw error;
  }
  const decision = parseDecision(ai.reply);
  if (decision) {
    decision.serviceName = canonicalName(context?.services, decision.serviceName);
    decision.workerName = canonicalName(context?.workers, decision.workerName);
    return decision;
  }
  return { action: 'REPLY', reply: clean(ai.reply, 1600), serviceName: null, workerName: null, requestedLocal: null, selectedSlotIndex: null, routeClass: 'SUPPORT' };
}

async function generationCurrent(job) {
  const value = await serviceRpc('dabbir_ai_job_generation_current', {
    p_job_id: job.job_id,
    p_processing_generation: job.processing_generation,
  });
  return value === true || one(value) === true;
}

async function setRuntime(context, { intent = null, pending = {}, slots = [], result = {} } = {}) {
  return serviceRpc('dabbir_action_set_runtime_state', {
    p_business_id: context.business.id,
    p_conversation_id: context.conversation.id,
    p_current_intent: intent,
    p_pending_action: pending,
    p_offered_slots: slots,
    p_last_action_result: result,
  });
}

function formatSlot(slot, language = 'ar') {
  const timezone = clean(slot?.timezone, 80) || 'Asia/Dubai';
  const date = new Date(slot?.starts_at);
  if (!Number.isFinite(date.getTime())) return clean(slot?.local_start, 80);
  try {
    return new Intl.DateTimeFormat(language === 'ar' ? 'ar-AE' : 'en-AE', {
      timeZone: timezone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  } catch {
    return clean(slot?.local_start, 80);
  }
}

function slotsReply(availability, language) {
  const slots = asArray(availability?.slots).slice(0, 3);
  if (!slots.length) return language === 'ar'
    ? 'لا يوجد وقت متاح قريب من الوقت المطلوب. أعطني وقتًا آخر يناسبك.'
    : 'There is no availability close to that time. Send me another time that works for you.';
  const labels = slots.map((slot, index) => {
    const worker = clean(slot?.worker_name, 120);
    const suffix = worker ? (language === 'ar' ? ` مع ${worker}` : ` with ${worker}`) : '';
    return `${index + 1}) ${formatSlot(slot, language)}${suffix}`;
  });
  return language === 'ar'
    ? `المتاح:\n${labels.join('\n')}\nاختر 1 أو 2 أو 3.`
    : `Available:\n${labels.join('\n')}\nChoose 1, 2, or 3.`;
}

function bookingReply(result, language) {
  const when = formatSlot({ starts_at: result?.starts_at, timezone: result?.timezone }, language);
  const service = clean(result?.service_name, 160);
  const worker = clean(result?.worker_name, 120);
  if (language === 'ar') return `تم الحجز ✅ ${service ? `${service} — ` : ''}${when}${worker ? ` مع ${worker}` : ''}.`;
  return `Booked ✅ ${service ? `${service} — ` : ''}${when}${worker ? ` with ${worker}` : ''}.`;
}

function simpleAvailabilityReply(availability, language) {
  const state = clean(availability?.state, 40);
  if (state === 'NEED_SERVICE') {
    const names = asArray(availability?.services).map(x => clean(x?.name, 100)).filter(Boolean).slice(0, 8);
    return language === 'ar' ? `أي خدمة تريد؟${names.length ? ` المتاح: ${names.join('، ')}` : ''}` : `Which service would you like?${names.length ? ` Available: ${names.join(', ')}` : ''}`;
  }
  if (state === 'NEED_WORKER') {
    const names = asArray(availability?.workers).map(x => clean(x?.name, 100)).filter(Boolean).slice(0, 8);
    return language === 'ar' ? `لم أجد الموظف المذكور.${names.length ? ` المتاح: ${names.join('، ')}` : ' يمكنني الحجز بدون تحديد موظف.'}` : `I couldn't find that staff member.${names.length ? ` Available: ${names.join(', ')}` : ' I can book without choosing a staff member.'}`;
  }
  if (state === 'NEED_TIME') return language === 'ar' ? 'ما اليوم والوقت الذي يناسبك؟' : 'What day and time works for you?';
  return slotsReply(availability, language);
}

async function reserveAiReply({ job, context, body, purpose }) {
  const text = clean(body, 4000);
  const idempotencyKey = `ai:${job.job_id}:${job.processing_generation}:${clean(purpose, 30)}:attempt:${job.attempts}`;
  return one(await serviceRpc('dabbir_whatsapp_reserve_ai_outbound', {
    p_business_id: context.business.id,
    p_conversation_id: context.conversation.id,
    p_idempotency_key: idempotencyKey,
    p_payload_hash: sha256(text),
    p_body: text,
  }));
}

async function sendReserved({ reservation, context, body }) {
  if (!reservation?.reservation_id) throw Object.assign(new Error('AI_OUTBOUND_RESERVATION_UNVERIFIED'), { code: 'AI_OUTBOUND_RESERVATION_UNVERIFIED' });
  if (reservation.should_send !== true) {
    return { deduplicated: true, reservationId: reservation.reservation_id, state: clean(reservation.reservation_state, 40), providerMessageId: clean(reservation.provider_message_id, 320) || null };
  }
  const key = serviceKey();
  if (!key) throw Object.assign(new Error('WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED'), { code: 'WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED' });
  const connection = await loadBusinessConnectionWithServiceKey(key, context.business.id);
  if (!connection || connection.status !== 'connected') {
    await markOutboundResult(reservation.reservation_id, 'FAILED', 'WHATSAPP_TENANT_NOT_LINKED');
    throw Object.assign(new Error('WHATSAPP_TENANT_NOT_LINKED'), { code: 'WHATSAPP_TENANT_NOT_LINKED' });
  }
  let sent = null;
  try {
    sent = await sendMetaText({ connection, businessId: context.business.id, recipient: reservation.recipient_handle, body });
  } catch (error) {
    const ambiguous = error?.ambiguous === true;
    await markOutboundResult(reservation.reservation_id, ambiguous ? 'AMBIGUOUS' : 'FAILED', clean(error?.code || error?.message, 160));
    error.ambiguous = ambiguous;
    throw error;
  }
  try {
    const finalized = await finalizeOutboundReply({ reservationId: reservation.reservation_id, providerMessageId: sent.providerMessageId });
    return { ...finalized, providerMessageId: sent.providerMessageId, deduplicated: false };
  } catch (error) {
    await markOutboundResult(reservation.reservation_id, 'AMBIGUOUS', 'WHATSAPP_OUTBOUND_FINALIZE_UNCERTAIN');
    error.ambiguous = true;
    throw error;
  }
}

async function deliverReply({ job, context, body, purpose = 'reply', reservation = null }) {
  if (!reservation) {
    if (!(await generationCurrent(job))) return { stale: true };
    reservation = await reserveAiReply({ job, context, body, purpose });
  }
  return sendReserved({ reservation, context, body });
}

async function checkAvailability(context, decision) {
  return serviceRpc('dabbir_action_check_availability', {
    p_business_id: context.business.id,
    p_conversation_id: context.conversation.id,
    p_service_name: decision.serviceName || null,
    p_worker_name: decision.workerName || null,
    p_requested_local: decision.requestedLocal || null,
  });
}

async function handleAvailability(job, context, decision, language) {
  const availability = await checkAvailability(context, decision);
  const slots = asArray(availability?.slots).slice(0, 3);
  await setRuntime(context, {
    intent: 'BOOKING',
    pending: { action: 'CREATE_BOOKING', service_name: decision.serviceName || availability?.service_name || null, worker_name: decision.workerName || null, requested_local: decision.requestedLocal || null },
    slots,
    result: { action: 'CHECK_AVAILABILITY', verified: true, state: availability?.state || null },
  });
  const reply = simpleAvailabilityReply(availability, language);
  const outbound = await deliverReply({ job, context, body: reply, purpose: 'availability' });
  return { action: 'CHECK_AVAILABILITY', availability, outbound };
}

async function handleBooking(job, context, slot, language) {
  if (!slot?.starts_at) throw Object.assign(new Error('BOOKING_SLOT_REQUIRED'), { code: 'BOOKING_SLOT_REQUIRED' });
  if (!(await generationCurrent(job))) return { action: 'CREATE_BOOKING', stale: true };
  const actionKey = `booking:${job.job_id}:${job.processing_generation}:${sha256(slot.starts_at).slice(0, 24)}`;
  try {
    const result = await serviceRpc('dabbir_action_create_booking_idempotent', {
      p_business_id: context.business.id,
      p_conversation_id: context.conversation.id,
      p_service_id: UUID.test(clean(slot.service_id, 80)) ? slot.service_id : null,
      p_worker_id: UUID.test(clean(slot.worker_id, 80)) ? slot.worker_id : null,
      p_starts_at: slot.starts_at,
      p_notes: 'Booked by DABBIR AI from verified WhatsApp conversation.',
      p_action_key: actionKey,
    });
    if (!result?.verified || !result?.appointment_id) throw Object.assign(new Error('BOOKING_ACTION_UNVERIFIED'), { code: 'BOOKING_ACTION_UNVERIFIED' });
    const reply = bookingReply(result, language);
    const outbound = await deliverReply({ job, context, body: reply, purpose: 'booking' });
    return { action: 'CREATE_BOOKING', result, outbound };
  } catch (error) {
    if (!String(error?.code || error?.message || '').includes('ACTION_SLOT_UNAVAILABLE')) throw error;
    const retryDecision = { serviceName: clean(slot.service_name, 180) || null, workerName: clean(slot.worker_name, 180) || null, requestedLocal: LOCAL_ISO.test(clean(slot.local_start, 40)) ? slot.local_start : null };
    const availability = await checkAvailability(context, retryDecision);
    const slots = asArray(availability?.slots).slice(0, 3);
    await setRuntime(context, { intent: 'BOOKING', pending: { action: 'CREATE_BOOKING', service_name: retryDecision.serviceName, worker_name: retryDecision.workerName }, slots, result: { action: 'CREATE_BOOKING', verified: false, state: 'SLOT_BECAME_UNAVAILABLE' } });
    const base = language === 'ar' ? 'هذا الموعد حُجز للتو.' : 'That slot was just taken.';
    const reply = slots.length ? `${base}\n${slotsReply(availability, language)}` : `${base} ${language === 'ar' ? 'أرسل لي وقتًا آخر يناسبك.' : 'Send me another time that works for you.'}`;
    const outbound = await deliverReply({ job, context, body: reply, purpose: 'slot-race' });
    return { action: 'CHECK_AVAILABILITY', availability, outbound, slotRace: true };
  }
}

async function handleHandoff(job, context, language, routeClass = 'SUPPORT') {
  const body = language === 'ar' ? 'تمام، حوّلت المحادثة للفريق وسيتولى شخص المتابعة من هنا.' : 'Done — I handed this conversation to the team for a person to continue from here.';
  if (!(await generationCurrent(job))) return { action: 'HANDOFF', stale: true };
  const reservation = await reserveAiReply({ job, context, body, purpose: 'handoff' });
  const handoff = await serviceRpc('dabbir_action_create_handoff', {
    p_business_id: context.business.id,
    p_conversation_id: context.conversation.id,
    p_route_class: routeClass,
    p_reason: 'Customer requested human assistance',
    p_summary: clean(latestCustomerText(context), 1000),
  });
  const outbound = await sendReserved({ reservation, context, body }).catch(error => {
    if (error?.ambiguous) return { ambiguous: true, error: clean(error?.code || error?.message, 160) };
    return { failed: true, error: clean(error?.code || error?.message, 160) };
  });
  return { action: 'HANDOFF', handoff, outbound };
}

async function finishJob(job, action, payload, result, handoff = false) {
  return serviceRpc('dabbir_ai_finish_action_job', {
    p_job_id: job.job_id,
    p_processing_generation: job.processing_generation,
    p_action_type: action,
    p_action_payload: payload || {},
    p_action_result: result || {},
    p_handoff: handoff,
  });
}

async function failJob(job, error) {
  return serviceRpc('dabbir_ai_fail_action_job', {
    p_job_id: job.job_id,
    p_processing_generation: job.processing_generation,
    p_error: clean(error?.code || error?.message || 'AI_ACTION_JOB_FAILED', 300),
  }).catch(() => null);
}

async function processJob(job) {
  const context = await serviceRpc('dabbir_ai_job_context', { p_job_id: job.job_id });
  if (!context?.business?.id || !context?.conversation?.id) throw new Error('AI_ACTION_CONTEXT_UNVERIFIED');
  const userText = latestCustomerText(context);
  const language = languageOf(userText);

  if (context.human_handoff_active) {
    await finishJob(job, 'HANDOFF', {}, { state: 'EXISTING_HANDOFF' }, true);
    return { jobId: job.job_id, state: 'HANDOFF', existing: true };
  }
  if (HUMAN_REQUEST.test(userText)) {
    const result = await handleHandoff(job, context, language, 'SUPPORT');
    await finishJob(job, 'HANDOFF', {}, result, true);
    return { jobId: job.job_id, state: 'HANDOFF' };
  }

  const offered = asArray(context?.runtime?.offered_slots).slice(0, 3);
  const directIndex = selectionIndex(userText);
  if (offered.length && directIndex !== null && offered[directIndex] && CONFIRM_BOOKING.test(userText)) {
    const result = await handleBooking(job, context, offered[directIndex], language);
    await finishJob(job, result.action || 'CREATE_BOOKING', { selected_slot_index: directIndex + 1 }, result, false);
    return { jobId: job.job_id, state: result.stale ? 'STALE' : 'COMPLETED', action: result.action };
  }

  const decision = await decide(context);
  if (decision.action === 'HANDOFF') {
    const result = await handleHandoff(job, context, language, decision.routeClass);
    await finishJob(job, 'HANDOFF', decision, result, true);
    return { jobId: job.job_id, state: 'HANDOFF' };
  }
  if (decision.action === 'CREATE_BOOKING') {
    const index = Number.isInteger(decision.selectedSlotIndex) ? decision.selectedSlotIndex : null;
    if (offered.length && index !== null && offered[index] && CONFIRM_BOOKING.test(userText)) {
      const result = await handleBooking(job, context, offered[index], language);
      await finishJob(job, result.action || 'CREATE_BOOKING', decision, result, false);
      return { jobId: job.job_id, state: result.stale ? 'STALE' : 'COMPLETED', action: result.action };
    }
    decision.action = 'REPLY';
    decision.reply = language === 'ar' ? 'اختر أحد الأوقات التي عرضتها لك لأؤكد الحجز.' : 'Choose one of the offered times and I’ll confirm the booking.';
  }
  if (decision.action === 'CHECK_AVAILABILITY') {
    const result = await handleAvailability(job, context, decision, language);
    await finishJob(job, 'CHECK_AVAILABILITY', decision, result, false);
    return { jobId: job.job_id, state: 'COMPLETED', action: 'CHECK_AVAILABILITY' };
  }

  const reply = clean(decision.reply, 1600) || (language === 'ar' ? 'كيف أقدر أساعدك؟' : 'How can I help?');
  const outbound = await deliverReply({ job, context, body: reply, purpose: 'reply' });
  const result = { action: 'REPLY', outbound };
  await finishJob(job, 'REPLY', decision, result, false);
  return { jobId: job.job_id, state: outbound?.stale ? 'STALE' : 'COMPLETED', action: 'REPLY' };
}

export async function enqueueWhatsAppAiAction({ phoneNumberId, conversationId, messageId } = {}) {
  if (!clean(phoneNumberId, 160) || !UUID.test(clean(conversationId, 80)) || !UUID.test(clean(messageId, 80))) {
    throw Object.assign(new Error('AI_ACTION_ENQUEUE_CONTEXT_REQUIRED'), { code: 'AI_ACTION_ENQUEUE_CONTEXT_REQUIRED' });
  }
  const jobId = await serviceRpc('dabbir_ai_enqueue_whatsapp_event', {
    p_phone_number_id: clean(phoneNumberId, 160),
    p_conversation_id: conversationId,
    p_message_id: messageId,
  });
  return { jobId: clean(jobId, 80) || clean(one(jobId), 80) };
}

export async function processWhatsAppAgentJobs({ delayMs = 0, limit = 8 } = {}) {
  if (delayMs > 0) await sleep(delayMs);
  const claimed = await serviceRpc('dabbir_ai_claim_action_jobs', { p_limit: Math.min(25, Math.max(1, Number(limit) || 8)) });
  const results = [];
  for (const job of asArray(claimed)) {
    try {
      results.push(await processJob(job));
    } catch (error) {
      if (error?.ambiguous === true) {
        try {
          const context = await serviceRpc('dabbir_ai_job_context', { p_job_id: job.job_id });
          const handoff = await serviceRpc('dabbir_action_create_handoff', {
            p_business_id: context.business.id,
            p_conversation_id: context.conversation.id,
            p_route_class: 'SUPPORT',
            p_reason: 'Ambiguous WhatsApp delivery result requires human review',
            p_summary: clean(error?.code || error?.message, 500),
          });
          await finishJob(job, 'HANDOFF', { reason: 'AMBIGUOUS_OUTBOUND' }, { handoff, ambiguous: true }, true);
          results.push({ jobId: job.job_id, state: 'HANDOFF', ambiguous: true });
          continue;
        } catch {}
      }
      await failJob(job, error);
      results.push({ jobId: job.job_id, state: 'FAILED_OR_REQUEUED', error: clean(error?.code || error?.message, 160) });
    }
  }
  return {
    claimed: asArray(claimed).length,
    completed: results.filter(x => x.state === 'COMPLETED').length,
    handoffs: results.filter(x => x.state === 'HANDOFF').length,
    results,
  };
}
