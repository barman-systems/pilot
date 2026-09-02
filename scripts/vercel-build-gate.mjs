import { spawnSync } from 'node:child_process';
import { existsSync, openSync, closeSync, writeFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const gateVersion = 'v3-final';
const rawSha = String(process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'local').trim();
const rawDeploymentId = String(process.env.VERCEL_DEPLOYMENT_ID || `pid-${process.pid}`).trim();
const safeSha = rawSha.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'local';
const safeDeploymentId = rawDeploymentId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || `pid-${process.pid}`;
const evidenceKey = `${safeDeploymentId}-${safeSha}`;
const marker = path.join(os.tmpdir(), `dabbir-vercel-tests-passed-${evidenceKey}`);
const lock = path.join(os.tmpdir(), `dabbir-vercel-tests-running-${evidenceKey}`);
const maxWaitMs = 120000;
const pollMs = 250;

function sleep(milliseconds) {
  const buffer = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buffer), 0, 0, milliseconds);
}

function runTests() {
  console.log(`[dabbir-build-gate:${gateVersion}] verifying deployment ${safeDeploymentId} commit ${safeSha}`);
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test'], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(`DABBIR_TEST_GATE_FAILED_${result.status ?? 1}`);
    error.exitCode = result.status ?? 1;
    throw error;
  }
  writeFileSync(marker, `${new Date().toISOString()}\n`, { encoding: 'utf8', mode: 0o600 });
  console.log(`[dabbir-build-gate:${gateVersion}] verified deployment ${safeDeploymentId} commit ${safeSha}`);
}

if (existsSync(marker)) {
  console.log(`[dabbir-build-gate:${gateVersion}] deployment ${safeDeploymentId} commit ${safeSha} already verified; skipping duplicate test run`);
  process.exit(0);
}

let lockFd = null;
try {
  lockFd = openSync(lock, 'wx', 0o600);
} catch (error) {
  if (error?.code !== 'EEXIST') throw error;
}

if (lockFd !== null) {
  let exitCode = 0;
  try {
    runTests();
  } catch (error) {
    exitCode = Number(error?.exitCode || 1);
    console.error(`[dabbir-build-gate:${gateVersion}] ${String(error?.message || error)}`);
  } finally {
    closeSync(lockFd);
    try { unlinkSync(lock); } catch {}
  }
  process.exit(exitCode);
}

const waitStarted = Date.now();
while (Date.now() - waitStarted < maxWaitMs) {
  if (existsSync(marker)) {
    console.log(`[dabbir-build-gate:${gateVersion}] deployment ${safeDeploymentId} commit ${safeSha} verified by another invocation`);
    process.exit(0);
  }
  if (!existsSync(lock)) {
    console.error(`[dabbir-build-gate:${gateVersion}] verification lock disappeared without success evidence`);
    process.exit(1);
  }
  sleep(pollMs);
}

console.error(`[dabbir-build-gate:${gateVersion}] timed out waiting for verified test evidence`);
process.exit(1);
