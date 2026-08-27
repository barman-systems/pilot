import { spawnSync } from 'node:child_process';
import { existsSync, openSync, closeSync, writeFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const rawSha = String(process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'local').trim();
const safeSha = rawSha.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'local';
const marker = path.join(os.tmpdir(), `dabbir-vercel-tests-passed-${safeSha}`);
const lock = path.join(os.tmpdir(), `dabbir-vercel-tests-running-${safeSha}`);
const maxWaitMs = 120000;
const pollMs = 250;

function sleep(milliseconds) {
  const buffer = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buffer), 0, 0, milliseconds);
}

function runTests() {
  console.log(`[dabbir-build-gate] verifying commit ${safeSha}`);
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test'], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  writeFileSync(marker, `${new Date().toISOString()}\n`, { encoding: 'utf8', mode: 0o600 });
  console.log(`[dabbir-build-gate] verified commit ${safeSha}`);
}

if (existsSync(marker)) {
  console.log(`[dabbir-build-gate] commit ${safeSha} already verified in this build environment; skipping duplicate test run`);
  process.exit(0);
}

let lockFd = null;
try {
  lockFd = openSync(lock, 'wx', 0o600);
} catch (error) {
  if (error?.code !== 'EEXIST') throw error;
}

if (lockFd !== null) {
  try {
    runTests();
  } finally {
    closeSync(lockFd);
    try { unlinkSync(lock); } catch {}
  }
  process.exit(0);
}

const waitStarted = Date.now();
while (Date.now() - waitStarted < maxWaitMs) {
  if (existsSync(marker)) {
    console.log(`[dabbir-build-gate] commit ${safeSha} verified by another build-gate invocation`);
    process.exit(0);
  }
  if (!existsSync(lock)) {
    console.error('[dabbir-build-gate] verification lock disappeared without success evidence');
    process.exit(1);
  }
  sleep(pollMs);
}

console.error('[dabbir-build-gate] timed out waiting for verified test evidence');
process.exit(1);
