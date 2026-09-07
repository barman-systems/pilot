import { captureSentryException, captureSentryMessage, sentryEnabled } from './_sentry-core.js';

const FLAG = Symbol.for('dabbir.sentry.runtime.installed');

if (!globalThis[FLAG]) {
  globalThis[FLAG] = true;

  const originalError = console.error.bind(console);
  console.error = (...args) => {
    originalError(...args);
    if (!sentryEnabled()) return;
    const first = args[0];
    const label = typeof first === 'string' ? first : '';
    if (!/^dabbir[_:-]/i.test(label) && !/_failed$/i.test(label)) return;
    void captureSentryMessage(label || 'DABBIR_SERVER_ERROR', {
      tags: { source: 'console.error' },
    });
  };

  process.on('uncaughtExceptionMonitor', error => {
    void captureSentryException(error, { tags: { source: 'uncaughtExceptionMonitor' } });
  });

  process.on('unhandledRejection', reason => {
    const error = reason instanceof Error ? reason : new Error(String(reason || 'UNHANDLED_REJECTION'));
    void captureSentryException(error, { tags: { source: 'unhandledRejection' } });
  });
}
