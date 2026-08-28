import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkPasswordCompromise, passwordHashRange } from '../api/_password-breach-check.js';

const root = new URL('../', import.meta.url);
const read = async path => readFile(new URL(path, root), 'utf8');

const signup = await read('api/auth/signup.js');
const resetRoute = await read('api/auth/reset-password.js');
const resetSecure = await read('api/auth/reset-password-secure.js');

function response(body, ok = true) {
  return { ok, text: async () => body };
}

test('Pwned Passwords range request uses k-anonymity and padding', async () => {
  const password = 'Falcon!47River';
  const { prefix, suffix } = passwordHashRange(password);
  let observed = null;
  const result = await checkPasswordCompromise(password, {
    fetchImpl: async (url, options) => {
      observed = { url: String(url), options };
      return response(`${suffix}:42\n00000000000000000000000000000000000:0\n`);
    },
  });

  assert.equal(result.compromised, true);
  assert.equal(result.count, 42);
  assert.equal(observed.url, `https://api.pwnedpasswords.com/range/${prefix}`);
  assert.equal(observed.url.includes(password), false);
  assert.equal(observed.options.headers['add-padding'], 'true');
  assert.match(observed.options.headers['user-agent'], /^DABBIR-password-security\//);
});

test('unseen password suffix is accepted only after a successful range response', async () => {
  const result = await checkPasswordCompromise('Falcon!47River', {
    fetchImpl: async () => response('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:9\n'),
  });
  assert.equal(result.compromised, false);
  assert.equal(result.count, 0);
});

test('breach lookup failure is fail-closed', async () => {
  await assert.rejects(
    checkPasswordCompromise('Falcon!47River', { fetchImpl: async () => { throw new Error('offline'); } }),
    error => error?.code === 'PASSWORD_BREACH_CHECK_UNAVAILABLE',
  );
  await assert.rejects(
    checkPasswordCompromise('Falcon!47River', { fetchImpl: async () => response('unavailable', false) }),
    error => error?.code === 'PASSWORD_BREACH_CHECK_UNAVAILABLE',
  );
});

test('signup and password reset cannot bypass the breach check', () => {
  assert.match(signup, /checkPasswordCompromise\(password\)/);
  assert.ok(signup.indexOf('checkPasswordCompromise(password)') < signup.indexOf("supabaseAuth('/auth/v1/signup'"));
  assert.match(resetRoute, /reset-password-secure\.js/);
  assert.match(resetSecure, /checkPasswordCompromise\(password\)/);
  assert.ok(resetSecure.indexOf('checkPasswordCompromise(password)') < resetSecure.indexOf("supabaseAuth('/auth/v1/user'"));
  assert.match(signup, /PASSWORD_SECURITY_CHECK_UNAVAILABLE/);
  assert.match(resetSecure, /PASSWORD_SECURITY_CHECK_UNAVAILABLE/);
});
