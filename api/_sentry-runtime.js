import { captureSentryException, captureSentryMessage, sentryEnabled } from './_sentry-core.js';

const FLAG = Symbol.for('dabbir.sentry.runtime.installed');
const SAFE_TAG = /^[A-Za-z0-9._:/-]{1,120}$/;

function tag(value, fallback = 'unknown') {
  const text = String(value == null ? '' : value).trim().slice(0, 120);
  return SAFE_TAG.test(text) ? text : fallback;
}

function structuredDabbirLog(value) {
  if (typeof value !== 'string' || value.length < 2 || value[0] !== '{') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && String(parsed.product || '').toUpperCase() === 'DABBIR' ? parsed : null;
  } catch {
    return null;
  }
}

function structuredContext(payload) {
  const component = tag(payload?.component, 'runtime');
  const operation = tag(payload?.operation, 'error');
  const outcome = tag(payload?.outcome, 'FAILED');
  const failureClass = tag(payload?.failure_class, 'UNKNOWN');
  return {
    message: `DABBIR_${component}_${operation}_${outcome}`,
    tags: {
      source: 'structured_log',
      component,
      operation,
      outcome,
      failure_class: failureClass,
    },
  };
}

if (!globalThis[FLAG]) {
  globalThis[FLAG] = true;

  const originalError = console.error.bind(console);
  console.error = (...args) => {
    originalError(...args);
    if (!sentryEnabled()) return;

    const first = args[0];
    const structured = structuredDabbirLog(first);
    const thrown = args.find(value => value instanceof Error);

    if (structured) {
      const context = structuredContext(structured);
      if (thrown) void captureSentryException(thrown, { tags: context.tags });
      else void captureSentryMessage(context.message, { tags: context.tags });
      return;
    }

    const label = typeof first === 'string' ? first.trim().slice(0, 1000) : '';
    if (!/^dabbir[_:-]/i.test(label) && !/_failed(?:\s|$)/i.test(label)) return;
    const tags = { source: 'console.error' };
    if (thrown) void captureSentryException(thrown, { tags });
    else void captureSentryMessage(label || 'DABBIR_SERVER_ERROR', { tags });
  };

  process.on('uncaughtExceptionMonitor', error => {
    void captureSentryException(error, { tags: { source: 'uncaughtExceptionMonitor' } });
  });

  process.on('unhandledRejection', reason => {
    const error = reason instanceof Error ? reason : new Error(String(reason || 'UNHANDLED_REJECTION'));
    void captureSentryException(error, { tags: { source: 'unhandledRejection' } });
  });
}
