import { defineConfig } from '@trigger.dev/sdk';

const project = process.env.TRIGGER_PROJECT_REF;
if (!/^proj_[A-Za-z0-9]+$/.test(project || '')) throw new Error('TRIGGER_PROJECT_REF_REQUIRED');

export default defineConfig({
  project,
  runtime: 'node-22',
  dirs: ['./tasks'],
  machine: 'micro',
  maxDuration: 10,
  retries: { enabledInDev: false, default: { maxAttempts: 3, minTimeoutInMs: 1_000, maxTimeoutInMs: 10_000, factor: 2, randomize: true } },
});
