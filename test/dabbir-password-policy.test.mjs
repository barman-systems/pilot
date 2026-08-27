import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isStrongPassword, passwordPolicy } from '../api/_password-policy.js';

const root = new URL('../', import.meta.url);
const read = async path => readFile(new URL(path, root), 'utf8');

const signup = await read('api/auth/signup.js');
const reset = await read('api/auth/reset-password.js');

test('DABBIR uses one password policy for signup and password recovery', () => {
  assert.match(signup, /_password-policy\.js/);
  assert.match(reset, /_password-policy\.js/);
  assert.match(signup, /isStrongPassword\(password, \{ email \}\)/);
  assert.match(reset, /isStrongPassword\(password\)/);
});

test('password policy rejects short, common, repeated and sequential credentials', () => {
  assert.equal(isStrongPassword('Short1!'), false);
  assert.equal(isStrongPassword('password123!'), false);
  assert.equal(isStrongPassword('AAAAAAAAAAAA!1'), false);
  assert.equal(isStrongPassword('Abcdef123456!'), false);
  assert.equal(isStrongPassword('Qwerty123456!'), false);
});

test('password policy rejects passwords containing the email identity', () => {
  const result = passwordPolicy('Barman2026!Secure', { email: 'barman@example.com' });
  assert.equal(result.valid, false);
  assert.ok(result.reasons.includes('CONTAINS_EMAIL_IDENTITY'));
});

test('password policy accepts diverse credentials and long passphrases', () => {
  assert.equal(isStrongPassword('Falcon!47River'), true);
  assert.equal(isStrongPassword('four uncommon words stay memorable together'), true);
});

test('password policy keeps a hard maximum bound', () => {
  assert.equal(isStrongPassword(`Aa1!${'x'.repeat(253)}`), false);
});
