import { AbortTaskRunError, task } from '@trigger.dev/sdk';
import { exportBudgetObservation, TELEMETRY_TASK_ID } from '../../../api/_dabbir-ai-observability.js';

// No database, booking, WhatsApp or model credentials are needed by this worker.
export const aiBudgetObservation = task({
  id: TELEMETRY_TASK_ID,
  machine: 'micro',
  maxDuration: 10,
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 3, minTimeoutInMs: 1_000, maxTimeoutInMs: 10_000, factor: 2, randomize: true },
  run: async payload => {
    const result = await exportBudgetObservation(payload);
    if (!result.ok) {
      if (!result.retryable) throw new AbortTaskRunError(result.reason);
      throw new Error(result.reason);
    }
    return { accepted: true, traceId: result.traceId };
  },
});
