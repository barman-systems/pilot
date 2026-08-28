import test from 'node:test';
import assert from 'node:assert/strict';
import { withServerReadTimeout } from '../api/_server-read-timeout.js';

test('early grouped-read failure aborts cooperative sibling work', async () => {
  let siblingAborted = false;
  await assert.rejects(
    withServerReadTimeout(signal => Promise.all([
      Promise.reject(new Error('MEMBERSHIP_FAILED_EARLY')),
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          siblingAborted = true;
          const error = new Error('sibling aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      }),
    ]), { errorCode: 'GROUP_TIMEOUT_SHOULD_NOT_REPLACE_EARLY_FAILURE', timeoutMs: 100 }),
    error => {
      assert.equal(error?.message, 'MEMBERSHIP_FAILED_EARLY');
      assert.notEqual(error?.status, 504);
      return true;
    },
  );
  assert.equal(siblingAborted, true, 'bounded helper must abort unfinished sibling work on early failure');
});

test('successful bounded read also releases its AbortSignal after completion', async () => {
  let signal = null;
  const value = await withServerReadTimeout(activeSignal => {
    signal = activeSignal;
    return Promise.resolve('ok');
  }, { timeoutMs: 100 });
  assert.equal(value, 'ok');
  assert.equal(signal?.aborted, true, 'completed bounded work should release cooperative resources');
});
