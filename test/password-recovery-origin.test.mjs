import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecoveryRedirect, requestPublicOrigin } from '../api/auth/forgot-password.js';

const production = { NODE_ENV: 'production', VERCEL: '1' };

test('builds recovery URL from the active public HTTPS origin', () => {
  const req = {
    headers: {
      'x-forwarded-host': 'app.dabbir.example',
      'x-forwarded-proto': 'https',
    },
  };

  assert.equal(requestPublicOrigin(req, production), 'https://app.dabbir.example');
  assert.equal(buildRecoveryRedirect(req, production), 'https://app.dabbir.example/?password_recovery=1');
});

test('rejects localhost in production', () => {
  const req = {
    headers: {
      host: 'localhost:3000',
      'x-forwarded-proto': 'http',
    },
  };

  assert.equal(requestPublicOrigin(req, production), null);
  assert.equal(buildRecoveryRedirect(req, production), null);
});

test('rejects non-HTTPS public origins in production', () => {
  const req = {
    headers: {
      'x-forwarded-host': 'app.dabbir.example',
      'x-forwarded-proto': 'http',
    },
  };

  assert.equal(requestPublicOrigin(req, production), null);
});

test('uses the first forwarded host and protocol value', () => {
  const req = {
    headers: {
      'x-forwarded-host': 'app.dabbir.example, internal.proxy',
      'x-forwarded-proto': 'https, http',
    },
  };

  assert.equal(requestPublicOrigin(req, production), 'https://app.dabbir.example');
  assert.equal(buildRecoveryRedirect(req, production), 'https://app.dabbir.example/?password_recovery=1');
});
