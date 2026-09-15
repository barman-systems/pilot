import { spawnSync } from 'node:child_process';

const gateVersion = 'v5-vercel-build-only';

function runNpm(args, label) {
  console.log(`[dabbir-build-gate:${gateVersion}] ${label}`);
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(`DABBIR_BUILD_GATE_${label.replace(/[^A-Z0-9]+/gi, '_').toUpperCase()}_FAILED_${result.status ?? 1}`);
    error.exitCode = result.status ?? 1;
    throw error;
  }
}

// GitHub DABBIR CI is the logical verification authority and already runs
// check:syntax, audit:prod, and the full npm test suite. Vercel must not
// duplicate those expensive checks for every intermediate preview commit.
// Keep one lightweight build-environment sanity check here; the actual UI
// bundle build runs immediately before this gate in `npm run dabbir:build`.
try {
  runNpm(['run', 'check:syntax'], 'vercel-build-syntax');
  console.log(`[dabbir-build-gate:${gateVersion}] Vercel build-environment verification passed`);
} catch (error) {
  console.error(`[dabbir-build-gate:${gateVersion}] ${String(error?.message || error)}`);
  process.exit(Number(error?.exitCode || 1));
}
