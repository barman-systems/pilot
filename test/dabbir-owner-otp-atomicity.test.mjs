import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = readFileSync(new URL('../supabase/functions/dabbir-owner-broker/index.ts', import.meta.url), 'utf8');
const hash = async text => Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).toString('hex');

test('one OTP can issue at most one session when two requests verify it concurrently', async () => {
  const challengeId = 'ee420731-3fc0-41c9-9519-dee987c23147';
  const actor = 'ccbe8166-d3f4-4058-a178-78ad348520f7';
  const key = 'isolated-test-key';
  const challenge = { id: challengeId, actor_user_id: actor, otp_hash: await hash(`${key}:dabbir-owner-otp:${challengeId}:123456`), expires_at: new Date(Date.now() + 60000).toISOString(), attempts: 0, consumed_at: null };
  let consumed = false, issued = 0, handler;
  const calls = [];
  const fetch = async (url, init = {}) => {
    const path = new URL(url).pathname;
    calls.push(path);
    const body = init.body ? JSON.parse(init.body) : {};
    const json = value => Response.json(value);
    if (path.endsWith('/dabbir_owner_otp_challenges') && !init.method) return json([{...challenge}]);
    if (path.endsWith('/dabbir_owner_otp_challenges') && init.method === 'PATCH') {
      const won = !consumed; consumed = true;
      return json(won ? [{...challenge, consumed_at: new Date().toISOString()}] : []);
    }
    if (path.endsWith('/dabbir_owner_session_issue_v1')) { issued++; return json(null); }
    if (path.endsWith('/dabbir_owner_otp_complete_v1')) {
      if (consumed) return json({authenticated: false, error: 'INVALID_OWNER_OTP'});
      assert.equal(body.p_otp_hash, challenge.otp_hash);
      consumed = true; issued++;
      return json({authenticated: true});
    }
    if (path.endsWith('/dabbir_owner_session_verify_v1')) return json({ authenticated: true, authority_role: 'OWNER_DELEGATE', actor_user_id: actor });
    throw new Error(`Unexpected test transport call: ${path}`);
  };
  const context = vm.createContext({ Deno: { env: {get: name => name === 'SUPABASE_URL' ? 'https://isolated.invalid' : key}, serve: fn => { handler = fn; } }, fetch, crypto: webcrypto, Response, Request, TextEncoder, Uint8Array, Uint32Array, btoa, console, performance });
  vm.runInContext(stripTypeScriptTypes(source), context);
  const request = () => new Request('https://isolated.invalid', {method: 'POST', body: JSON.stringify({action: 'owner_otp_verify', challenge_id: challengeId, otp: '123456'})});
  const responses = await Promise.all([handler(request()), handler(request())]);
  const bodies = await Promise.all(responses.map(r => r.json()));
  assert.equal(bodies.filter(r => r.authenticated === true).length, 1, 'a replay must not return a second authenticated session');
  assert.equal(issued, 1, 'the losing request must never issue a session');
});
