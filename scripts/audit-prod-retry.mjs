import { spawn } from 'node:child_process';

const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 20000;
const KILL_GRACE_MS = 2000;
const RETRY_DELAYS_MS = [1500, 4000];
const transientPattern = /(?:\b429\b|\b5\d\d\b|service unavailable|audit endpoint returned an error|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|network timeout|network error)/i;

function runAudit() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
      'audit',
      '--omit=dev',
      '--audit-level=high',
    ], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let killTimer;

    const timeout = setTimeout(() => {
      timedOut = true;
      stderr += `\nETIMEDOUT npm audit exceeded ${ATTEMPT_TIMEOUT_MS}ms`;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS);
      killTimer.unref?.();
    }, ATTEMPT_TIMEOUT_MS);
    timeout.unref?.();

    child.stdout.on('data', (chunk) => { stdout += chunk; process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { stderr += chunk; process.stderr.write(chunk); });
    child.once('error', (error) => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      if (!settled) {
        settled = true;
        resolve({ code: timedOut ? 124 : (code ?? 1), signal, stdout, stderr });
      }
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  const result = await runAudit();
  if (result.code === 0) process.exit(0);

  const combined = `${result.stdout}\n${result.stderr}`;
  const transient = transientPattern.test(combined);
  if (!transient) {
    console.error(`[audit:prod] security audit failed with a non-transient result on attempt ${attempt}; refusing to bypass.`);
    process.exit(result.code || 1);
  }

  if (attempt === MAX_ATTEMPTS) {
    console.error(`[audit:prod] npm security service remained unavailable after ${MAX_ATTEMPTS} attempts; failing closed.`);
    process.exit(result.code || 1);
  }

  const delay = RETRY_DELAYS_MS[attempt - 1];
  console.error(`[audit:prod] transient npm audit transport/service failure on attempt ${attempt}; retrying in ${delay}ms.`);
  await sleep(delay);
}

process.exit(1);
