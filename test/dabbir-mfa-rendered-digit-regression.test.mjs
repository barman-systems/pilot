import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/auth-session-stability-ui.js';

function renderAuthStabilityScript() {
  let statusCode = null;
  let body = '';
  const headers = new Map();
  const req = { method: 'GET' };
  const res = {
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
      return this;
    },
    status(code) {
      statusCode = Number(code);
      return this;
    },
    send(value) {
      body = String(value ?? '');
      return this;
    },
    end(value = '') {
      body = String(value ?? '');
      return this;
    },
  };
  handler(req, res);
  return { statusCode, body, headers };
}

test('rendered browser script accepts numeric TOTP codes instead of a literal backslash-d sequence', () => {
  const rendered = renderAuthStabilityScript();
  assert.equal(rendered.statusCode, 200);
  assert.match(String(rendered.headers.get('content-type') || ''), /application\/javascript/);

  const expected = "if(!/^\\d{6,8}$/.test(code)){";
  const broken = "if(!/^\\\\d{6,8}$/.test(code)){";
  assert.ok(rendered.body.includes(expected), 'RENDERED_TOTP_DIGIT_REGEX_MISSING');
  assert.equal(rendered.body.includes(broken), false, 'RENDERED_TOTP_REGEX_DOUBLE_ESCAPED');
  assert.doesNotThrow(() => new Function(rendered.body));
});
