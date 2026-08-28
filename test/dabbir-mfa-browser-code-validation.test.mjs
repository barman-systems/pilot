import test from 'node:test';
import assert from 'node:assert/strict';
import authSessionStabilityHandler from '../api/auth-session-stability-ui.js';

function renderClientScript() {
  let body = '';
  let statusCode = null;
  const headers = new Map();
  const res = {
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), String(value));
      return this;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    send(value) {
      body = String(value);
      return this;
    },
    end(value = '') {
      body = String(value);
      return this;
    },
  };
  authSessionStabilityHandler({ method: 'GET' }, res);
  return { body, statusCode, headers };
}

test('rendered MFA browser validation accepts numeric TOTP codes instead of a literal backslash-d sequence', () => {
  const { body, statusCode } = renderClientScript();
  assert.equal(statusCode, 200);
  assert.ok(body.includes("if(!/^\\d{6,8}$/.test(code)){"), 'rendered client must use the digit-class regex');
  assert.ok(!body.includes("if(!/^\\\\d{6,8}$/.test(code)){"), 'rendered client must not contain an over-escaped literal \\d regex');
  assert.match(body, /ios-auth-stability-v6-mfa-code/);
});
