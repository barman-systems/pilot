function firstEnv(...names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

export function metaTestModeEnabled() {
  const raw = firstEnv('DABBIR_WHATSAPP_META_TEST_MODE', 'PILOT_WHATSAPP_META_TEST_MODE').toLowerCase();
  return ['1', 'true', 'enabled', 'on'].includes(raw);
}

export function metaTestConfig() {
  const configuredGraphVersion = firstEnv('DABBIR_META_GRAPH_VERSION', 'PILOT_META_GRAPH_VERSION', 'META_GRAPH_VERSION');
  return {
    enabled: metaTestModeEnabled(),
    accessToken: firstEnv(
      'DABBIR_WHATSAPP_TEST_ACCESS_TOKEN',
      'DABBIR_WHATSAPP_ACCESS_TOKEN',
      'PILOT_WHATSAPP_ACCESS_TOKEN',
      'WHATSAPP_ACCESS_TOKEN',
      'META_WHATSAPP_ACCESS_TOKEN',
    ),
    phoneNumberId: firstEnv(
      'DABBIR_WHATSAPP_TEST_PHONE_NUMBER_ID',
      'DABBIR_WHATSAPP_PHONE_NUMBER_ID',
      'PILOT_WHATSAPP_PHONE_NUMBER_ID',
      'WHATSAPP_PHONE_NUMBER_ID',
      'META_WHATSAPP_PHONE_NUMBER_ID',
    ),
    graphVersion: configuredGraphVersion === 'v23.0' ? 'v26.0' : (configuredGraphVersion || 'v26.0'),
  };
}

export function metaTestReplyText() {
  return firstEnv('DABBIR_WHATSAPP_META_TEST_REPLY_TEXT')
    || 'تم استلام رسالتك في بيئة دبّر التجريبية ✅\nجرّب الآن أن تكتب: أريد حجز غداً الساعة 5';
}

export async function sendMetaTestReply(event, config = metaTestConfig()) {
  if (!config.enabled) return { attempted: false, sent: false, reason: 'TEST_MODE_DISABLED' };
  if (event?.type !== 'message' || !event?.from) return { attempted: false, sent: false, reason: 'NOT_INBOUND_MESSAGE' };
  if (!config.accessToken || !config.phoneNumberId) return { attempted: false, sent: false, reason: 'TEST_CREDENTIALS_NOT_CONFIGURED' };

  // Fail closed: the test sender may only reply to webhooks that arrived for the
  // configured Meta test-number phone ID. This prevents accidental replies from
  // tenant/production numbers if the test flag is left enabled.
  if (String(event.phoneNumberId || '') !== String(config.phoneNumberId)) {
    return { attempted: false, sent: false, reason: 'PHONE_NUMBER_ID_MISMATCH' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch(
      `https://graph.facebook.com/${encodeURIComponent(config.graphVersion)}/${encodeURIComponent(config.phoneNumberId)}/messages`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: String(event.from),
          type: 'text',
          text: { preview_url: false, body: metaTestReplyText() },
        }),
        cache: 'no-store',
        signal: controller.signal,
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        attempted: true,
        sent: false,
        reason: 'META_TEST_SEND_FAILED',
        providerStatus: response.status,
        providerCode: payload?.error?.code || null,
      };
    }
    return {
      attempted: true,
      sent: true,
      reason: null,
      providerStatus: response.status,
      messageId: payload?.messages?.[0]?.id || null,
    };
  } catch (error) {
    return {
      attempted: true,
      sent: false,
      reason: error?.name === 'AbortError' ? 'META_TEST_SEND_TIMEOUT' : 'META_TEST_SEND_UNAVAILABLE',
    };
  } finally {
    clearTimeout(timeout);
  }
}
