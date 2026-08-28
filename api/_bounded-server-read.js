export const DABBIR_SERVER_READ_TIMEOUT_MS = 8000;

function normalizedTimeout(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DABBIR_SERVER_READ_TIMEOUT_MS;
  return Math.max(1, Math.min(30000, Math.floor(number)));
}

export function serverReadTimeoutError(errorCode = 'UPSTREAM_DATA_TIMEOUT') {
  const code = String(errorCode || 'UPSTREAM_DATA_TIMEOUT').slice(0, 120);
  return Object.assign(new Error(code), {
    status: 504,
    code: 504,
    errorCode: code,
    timeout: true,
  });
}

export async function withServerReadTimeout(operation, options = {}) {
  if (typeof operation !== 'function') throw new TypeError('SERVER_READ_OPERATION_REQUIRED');
  const timeoutMs = normalizedTimeout(options.timeoutMs);
  const errorCode = String(options.errorCode || 'UPSTREAM_DATA_TIMEOUT').slice(0, 120);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  timer.unref?.();

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (timedOut) throw serverReadTimeoutError(errorCode);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
