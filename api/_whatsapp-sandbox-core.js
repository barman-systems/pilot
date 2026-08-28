import crypto from 'node:crypto';
import { generateDABBIRAiReply } from './_ai-core.js';
import { serviceRpc } from './_whatsapp-live-core.js';

function clean(value, max = 4000) {
  return String(value || '').trim().slice(0, max);
}

function firstEnv(env, ...names) {
  for (const name of names) {
    const value = clean(env?.[name], 4096);
    if (value) return value;
  }
  return '';
}

export function getWhatsAppSandboxConfig(env = process.env) {
  const accessToken = firstEnv(
    env,
    'DABBIR_WHATSAPP_SANDBOX_ACCESS_TOKEN',
    'DABBIR_WHATSAPP_ACCESS_TOKEN',
    'PILOT_WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_ACCESS_TOKEN',
    'META_WHATSAPP_ACCESS_TOKEN',
  );
  const phoneNumberId = firstEnv(
    env,
    'DABBIR_WHATSAPP_SANDBOX_PHONE_NUMBER_ID',
    'DABBIR_WHATSAPP_PHONE_NUMBER_ID',
    'PILOT_WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_PHONE_NUMBER_ID',
    'META_WHATSAPP_PHONE_NUMBER_ID',
  );
  const graphVersion = firstEnv(env, 'DABBIR_META_GRAPH_VERSION', 'PILOT_META_GRAPH_VERSION', 'META_GRAPH_VERSION') || 'v23.0';
  return {
    accessToken,
    phoneNumberId,
    graphVersion,
    configured: Boolean(accessToken && phoneNumberId),
  };
}

export function sandboxServerCapability(env = process.env) {
  const config = getWhatsAppSandboxConfig(env);
  return {
    configured: config.configured,
    phone_number_configured: Boolean(config.phoneNumberId),
    access_token_configured: Boolean(config.accessToken),
  };
}

export function isSandboxPhoneNumber(phoneNumberId, env = process.env) {
  const configured = getWhatsAppSandboxConfig(env).phoneNumberId;
  return Boolean(configured && clean(phoneNumberId, 160) === configured);
}

export async function verifySandboxSender(env = process.env, fetchImpl = fetch) {
  const config = getWhatsAppSandboxConfig(env);
  if (!config.configured) {
    return { ok: false, available: false, reason: 'WHATSAPP_SANDBOX_PLATFORM_NOT_CONFIGURED' };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const url = new URL(`https://graph.facebook.com/${encodeURIComponent(config.graphVersion)}/${encodeURIComponent(config.phoneNumberId)}`);
    url.searchParams.set('fields', 'display_phone_number,verified_name');
    const response = await fetchImpl(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: { authorization: `Bearer ${config.accessToken}`, accept: 'application/json' },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        available: false,
        reason: 'WHATSAPP_SANDBOX_META_AUTHORIZATION_FAILED',
        provider_status: response.status,
      };
    }
    const displayPhoneNumber = clean(payload?.display_phone_number, 80);
    const digits = displayPhoneNumber.replace(/\D/g, '');
    if (!digits) {
      return { ok: false, available: false, reason: 'WHATSAPP_SANDBOX_DISPLAY_NUMBER_UNAVAILABLE' };
    }
    return {
      ok: true,
      available: true,
      phone_number_id: config.phoneNumberId,
      display_phone_number: displayPhoneNumber,
      wa_digits: digits,
      verified_name: clean(payload?.verified_name, 120) || null,
      provider_status: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      available: false,
      reason: error?.name === 'AbortError'
        ? 'WHATSAPP_SANDBOX_META_AUTHORIZATION_TIMEOUT'
        : 'WHATSAPP_SANDBOX_META_AUTHORIZATION_UNAVAILABLE',
    };
  } finally {
    clearTimeout(timeout);
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function oneRow(payload) {
  return Array.isArray(payload) ? payload[0] || null : payload || null;
}

function occurredAt(timestamp) {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return new Date().toISOString();
  const date = new Date(seconds * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

export async function createOwnerSandboxSession({ businessId, ttlMinutes = 20, env = process.env, fetchImpl = fetch } = {}) {
  const sender = await verifySandboxSender(env, fetchImpl);
  if (!sender.ok) {
    const error = new Error(sender.reason || 'WHATSAPP_SANDBOX_UNAVAILABLE');
    error.status = sender.provider_status ? 409 : 503;
    error.code = sender.reason || 'WHATSAPP_SANDBOX_UNAVAILABLE';
    throw error;
  }
  const token = crypto.randomBytes(24).toString('base64url');
  const tokenHash = sha256(token);
  const row = oneRow(await serviceRpc('dabbir_whatsapp_sandbox_create_session', {
    p_business_id: String(businessId),
    p_token_hash: tokenHash,
    p_platform_phone_number_id: sender.phone_number_id,
    p_ttl_minutes: Number(ttlMinutes),
  }));
  if (!row?.session_id || !row?.expires_at) {
    const error = new Error('WHATSAPP_SANDBOX_SESSION_CREATE_UNVERIFIED');
    error.status = 502;
    throw error;
  }
  const prefill = `DABBIR TEST ${token}\nمرحبا، أريد تجربة دبّر على واتساب.`;
  return {
    sessionId: row.session_id,
    expiresAt: row.expires_at,
    displayPhoneNumber: sender.display_phone_number,
    verifiedName: sender.verified_name,
    whatsappUrl: `https://wa.me/${sender.wa_digits}?text=${encodeURIComponent(prefill)}`,
    mode: 'OWNER_SANDBOX',
  };
}

export function parseSandboxToken(text = '') {
  const input = String(text || '').slice(0, 4000);
  const match = input.match(/^\s*DABBIR\s+TEST\s+([A-Za-z0-9_-]{20,80})(?:\s*(?:[\r\n:|\-]+)\s*)?/i);
  if (!match) return { tokenHash: null, body: clean(input, 4000) };
  const body = clean(input.slice(match[0].length), 4000)
    || 'مرحبا، أريد تجربة دبّر على واتساب.';
  return { tokenHash: sha256(match[1]), body };
}

export async function persistSandboxInbound(event) {
  if (!event?.messageId || !event?.phoneNumberId || !event?.from) {
    const error = new Error('WHATSAPP_SANDBOX_INBOUND_EVENT_INCOMPLETE');
    error.status = 400;
    throw error;
  }
  const parsed = parseSandboxToken(event.text);
  const row = oneRow(await serviceRpc('dabbir_whatsapp_sandbox_route_inbound', {
    p_phone_number_id: clean(event.phoneNumberId, 160),
    p_provider_message_id: clean(event.messageId, 320),
    p_sender_handle: clean(event.from, 160),
    p_display_name: clean(event.contactName, 120) || null,
    p_token_hash: parsed.tokenHash,
    p_body: parsed.body,
    p_occurred_at: occurredAt(event.timestamp),
  }));
  if (!row?.event_id || !row?.business_id || !row?.conversation_id || !row?.customer_message_id) {
    const error = new Error('WHATSAPP_SANDBOX_INBOUND_PERSISTENCE_UNVERIFIED');
    error.status = 502;
    throw error;
  }
  return {
    sessionId: row.session_id,
    eventId: row.event_id,
    businessId: row.business_id,
    conversationId: row.conversation_id,
    customerMessageId: row.customer_message_id,
    duplicate: row.duplicate === true,
    replyState: clean(row.reply_state, 40),
    storedReplyBody: clean(row.stored_reply_body, 4000) || null,
    businessName: clean(row.business_name, 120) || null,
    businessType: clean(row.business_type, 40) || 'other',
    locale: clean(row.locale, 20) || 'ar-AE',
    message: parsed.body,
  };
}

function projectForBusinessType(type) {
  if (type === 'clinic') return 'dabbir_clinics';
  if (type === 'creator') return 'dabbir_celebrities';
  return 'dabbir_businesses';
}

function languageFor(message, locale = 'ar-AE') {
  const text = String(message || '');
  if (/[\u0600-\u06FF]/.test(text)) return 'ar';
  if (/[A-Za-z]/.test(text)) return 'en';
  return String(locale || '').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

function businessContextFrom(context = {}) {
  return JSON.stringify({
    business: context?.business || null,
    knowledge: Array.isArray(context?.knowledge) ? context.knowledge : [],
  });
}

function historyFrom(context = {}) {
  return Array.isArray(context?.history) ? context.history : [];
}

async function sendSandboxMetaText({ recipient, body, env = process.env, fetchImpl = fetch }) {
  const config = getWhatsAppSandboxConfig(env);
  if (!config.configured || !clean(recipient, 160) || !clean(body, 4000)) {
    const error = new Error('WHATSAPP_SANDBOX_OUTBOUND_CONTEXT_INCOMPLETE');
    error.status = 503;
    error.definitive = true;
    throw error;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetchImpl(`https://graph.facebook.com/${encodeURIComponent(config.graphVersion)}/${encodeURIComponent(config.phoneNumberId)}/messages`, {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${config.accessToken}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: clean(recipient, 160),
        type: 'text',
        text: { preview_url: false, body: clean(body, 4000) },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error('WHATSAPP_SANDBOX_META_SEND_FAILED');
      error.status = response.status >= 500 ? 502 : 409;
      error.providerStatus = response.status;
      error.providerCode = payload?.error?.code || null;
      error.ambiguous = response.status >= 500;
      error.definitive = response.status >= 400 && response.status < 500;
      throw error;
    }
    const providerMessageId = clean(payload?.messages?.[0]?.id, 320);
    if (!providerMessageId) {
      const error = new Error('WHATSAPP_SANDBOX_META_SEND_ACCEPTED_WITHOUT_ID');
      error.status = 502;
      error.ambiguous = true;
      throw error;
    }
    return { providerMessageId, providerStatus: response.status };
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('WHATSAPP_SANDBOX_META_SEND_TIMEOUT_AMBIGUOUS');
      timeoutError.status = 502;
      timeoutError.ambiguous = true;
      throw timeoutError;
    }
    if (error instanceof TypeError && error?.ambiguous !== false) error.ambiguous = true;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function replyToSandboxInbound(route, { env = process.env, fetchImpl = fetch } = {}) {
  if (!route?.eventId) throw Object.assign(new Error('WHATSAPP_SANDBOX_EVENT_REQUIRED'), { status: 400 });
  if (['PROVIDER_ACCEPTED','SENDING','AMBIGUOUS'].includes(route.replyState)) {
    return { sent: false, state: route.replyState, replayProtected: true };
  }

  let reply = route.storedReplyBody;
  let aiState = null;
  if (!reply) {
    const context = oneRow(await serviceRpc('dabbir_whatsapp_sandbox_ai_context', {
      p_event_id: route.eventId,
    })) || {};
    const aiResult = await generateDABBIRAiReply({
      project: projectForBusinessType(route.businessType),
      message: route.message,
      language: languageFor(route.message, route.locale),
      businessContext: businessContextFrom(context),
      history: historyFrom(context),
      env,
      fetchImpl,
    });
    aiState = aiResult.state || null;
    if (aiResult.ok && clean(aiResult.reply, 4000)) {
      reply = clean(aiResult.reply, 4000);
    } else {
      reply = languageFor(route.message, route.locale) === 'ar'
        ? 'وصلت رسالتك إلى دبّر عبر واتساب بنجاح. الذكاء غير متاح للحظة، لكن قناة التجربة تعمل ويمكنك المحاولة مرة أخرى.'
        : 'Your message reached DABBIR through WhatsApp successfully. AI is temporarily unavailable, but the test channel is working and you can try again.';
    }
  }

  const prepared = oneRow(await serviceRpc('dabbir_whatsapp_sandbox_prepare_reply', {
    p_event_id: route.eventId,
    p_reply_body: reply,
    p_reply_body_hash: sha256(reply),
  }));
  if (!prepared?.event_id || !prepared?.recipient_handle) {
    throw Object.assign(new Error('WHATSAPP_SANDBOX_REPLY_RESERVATION_UNVERIFIED'), { status: 502 });
  }
  if (prepared.should_send !== true) {
    return { sent: false, state: clean(prepared.reply_state, 40), replayProtected: true, aiState };
  }

  try {
    const provider = await sendSandboxMetaText({ recipient: prepared.recipient_handle, body: reply, env, fetchImpl });
    const finalized = oneRow(await serviceRpc('dabbir_whatsapp_sandbox_finalize_reply', {
      p_event_id: route.eventId,
      p_provider_reply_message_id: provider.providerMessageId,
    }));
    if (!finalized?.ai_message_id || clean(finalized.reply_state, 40) !== 'PROVIDER_ACCEPTED') {
      const error = new Error('WHATSAPP_SANDBOX_REPLY_FINALIZE_UNVERIFIED');
      error.status = 502;
      error.ambiguous = true;
      throw error;
    }
    return {
      sent: true,
      state: 'PROVIDER_ACCEPTED',
      providerMessageId: provider.providerMessageId,
      aiMessageId: finalized.ai_message_id,
      aiState,
    };
  } catch (error) {
    const state = error?.ambiguous ? 'AMBIGUOUS' : 'FAILED';
    await serviceRpc('dabbir_whatsapp_sandbox_mark_reply_result', {
      p_event_id: route.eventId,
      p_state: state,
      p_error_code: clean(error?.providerCode || error?.message || state, 160),
    }).catch(() => null);
    throw error;
  }
}

export async function applySandboxStatus(event) {
  const row = oneRow(await serviceRpc('dabbir_whatsapp_sandbox_apply_status', {
    p_phone_number_id: clean(event?.phoneNumberId, 160),
    p_provider_message_id: clean(event?.messageId, 320),
    p_status: clean(event?.status, 40),
  }));
  return {
    matched: row?.matched === true,
    state: clean(row?.reply_state, 40) || null,
  };
}
