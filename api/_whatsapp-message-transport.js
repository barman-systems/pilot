/**
 * One HTTP attempt for every active WhatsApp message adapter. The supplied
 * message is already normalized and authorized by its caller. Provider-specific
 * domain error names and durable session receipts stay with those adapters.
 * No retries, database writes, credential lookup or logging occur here.
 * @returns {Promise<{response: Response, payload: object}>}
 */
export async function requestMetaMessage({ graphVersion, phoneNumberId, token, message }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(message),
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Meta message transport. Callers must authorize and durably reserve first.
 * Owns exactly one HTTP attempt, provider acceptance and ambiguous-send detection.
 * Does not resolve tenants, decrypt credentials, reserve, finalize or retry.
 *
 * @param {{ graphVersion: string, phoneNumberId: string, token: string,
 *   message: object, errors: { failed: string, withoutId: string, timeout: string } }} input
 * @returns {Promise<{providerMessageId: string, providerStatus: number}>}
 */
export async function sendMetaMessage({ graphVersion, phoneNumberId, token, message, errors }) {
  try {
    const { response, payload } = await requestMetaMessage({ graphVersion, phoneNumberId, token, message });
    if (!response.ok) {
      const error = new Error(errors.failed);
      error.status = response.status >= 500 ? 502 : 409;
      error.providerStatus = response.status;
      error.providerCode = payload?.error?.code || null;
      error.ambiguous = response.status >= 500;
      error.definitive = response.status >= 400 && response.status < 500;
      throw error;
    }
    const providerMessageId = String(payload?.messages?.[0]?.id || '').trim().slice(0, 320);
    if (!providerMessageId) {
      const error = new Error(errors.withoutId);
      error.status = 502;
      error.ambiguous = true;
      throw error;
    }
    return { providerMessageId, providerStatus: response.status };
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error(errors.timeout);
      timeoutError.status = 502;
      timeoutError.ambiguous = true;
      throw timeoutError;
    }
    if (error instanceof TypeError && error?.ambiguous !== false) error.ambiguous = true;
    throw error;
  }
}
