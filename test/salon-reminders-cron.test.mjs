import test from 'node:test';
import assert from 'node:assert/strict';
import { cronAuthMode, resolveVercelOidcToken } from '../api/salon-reminders-cron.js';

test('cron auth accepts the configured secret only with the exact bearer value', () => {
  const env = { CRON_SECRET: 'cron-secret', VERCEL_ENV: 'production' };
  assert.equal(cronAuthMode({ headers: { authorization: 'Bearer cron-secret' } }, env), 'secret');
  assert.equal(cronAuthMode({ headers: { authorization: 'cron-secret' } }, env), null);
  assert.equal(cronAuthMode({ headers: { authorization: 'Bearer wrong' } }, env), null);
});

test('cron auth accepts the Vercel schedule identity when no shared secret is configured', () => {
  const env = { VERCEL_ENV: 'production' };
  assert.equal(cronAuthMode({ headers: {
    'user-agent': 'vercel-cron/1.0',
    'x-vercel-cron-schedule': '*/5 * * * *',
  } }, env), 'vercel_schedule');
});

test('OIDC resolver prefers an explicitly configured token', async () => {
  const token = await resolveVercelOidcToken({ VERCEL_ENV: 'production', VERCEL_OIDC_TOKEN: 'configured.jwt.token' }, async () => 'runtime.jwt.token');
  assert.equal(token, 'configured.jwt.token');
});

test('OIDC resolver obtains a runtime token when the environment is Vercel', async () => {
  const token = await resolveVercelOidcToken({ VERCEL_ENV: 'production' }, async () => 'runtime.jwt.token');
  assert.equal(token, 'runtime.jwt.token');
});

test('OIDC resolver stays empty outside Vercel when no token is configured', async () => {
  const token = await resolveVercelOidcToken({}, async () => 'runtime.jwt.token');
  assert.equal(token, '');
});
