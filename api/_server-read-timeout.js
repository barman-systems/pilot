function makeTimeoutError(label, errorCode) {
  const code = String(errorCode || `${String(label || 'SERVER_READ').toUpperCase()}_TIMEOUT`).slice(0, 120);
  const error = new Error(code);
  error.status = 504;
  error.code = 504;
  error.safeCode = code;
  error.errorCode = code;
  error.failureClass = 'TIMEOUT';
  error.timeout = true;
  return error;
}

export async function withServerReadTimeout(operation, { label = 'SERVER_READ', errorCode = null, timeoutMs = 10_000 } = {}) {
  if (typeof operation !== 'function') throw new TypeError('SERVER_READ_OPERATION_REQUIRED');
  const boundedMs = Math.max(1, Math.min(Number(timeoutMs) || 10_000, 60_000));
  const controller = new AbortController();
  let timer = null;

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(makeTimeoutError(label, errorCode));
    }, boundedMs);
  });

  const operationPromise = Promise.resolve()
    .then(() => operation(controller.signal))
    .catch(error => {
      if (controller.signal.aborted) throw makeTimeoutError(label, errorCode);
      throw error;
    });

  try {
    return await Promise.race([operationPromise, timeoutPromise]);
  } finally {
    if (!controller.signal.aborted) controller.abort();
    if (timer) clearTimeout(timer);
  }
}
