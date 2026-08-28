import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/auth-session-stability-ui.js';

function emittedScript() {
  let body = '';
  const headers = new Map();
  const res = {
    statusCode: 0,
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); return this; },
    status(code) { this.statusCode = code; return this; },
    send(value = '') { body = String(value); return this; },
    end(value = '') { body = String(value); return this; },
  };
  handler({ method: 'GET' }, res);
  assert.equal(res.statusCode, 200);
  assert.match(headers.get('content-type') || '', /javascript/);
  return body;
}

test('served MFA UI validates 6-8 ASCII digits without String.raw regex escaping', () => {
  const script = emittedScript();
  assert.match(script, /function validNumericMfaCode\(code\)/);
  assert.match(script, /code\.length>=6&&code\.length<=8/);
  assert.match(script, /char>='0'&&char<='9'/);
  assert.doesNotMatch(script, /\\\\d\{6,8\}/);
  assert.match(script, /if\(!validNumericMfaCode\(code\)\)/);
});

test('served MFA submit reaches verification only after numeric validation', () => {
  const script = emittedScript();
  const validation = script.indexOf('if(!validNumericMfaCode(code))');
  const verify = script.indexOf("api('/api/auth/mfa-verify'");
  assert.ok(validation >= 0, 'MFA_NUMERIC_VALIDATION_MISSING');
  assert.ok(verify > validation, 'MFA_VERIFY_MUST_FOLLOW_NUMERIC_VALIDATION');
});
