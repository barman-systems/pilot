import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = readFileSync(new URL('../supabase/functions/dabbir-owner-broker/index.ts', import.meta.url), 'utf8');
const hash = async text => Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).toString('hex');

for (const [name,scenario,body,expected] of [
 ['verification outage preserves an unavailable result','outage',{action:'owner_session_verify'},503],
 ['malformed verification fails closed as unavailable','malformed',{action:'owner_session_verify'},503],
 ['network rejection in async owner data is caught','network',{action:'owner_data',data_action:'overview'},503],
 ['a rejected session is unauthorized','invalid',{action:'owner_session_verify'},401],
 ['business-scoped delegates cannot read global CEO work','scoped',{action:'owner_data',data_action:'ceo_commands'},403],
 ['granular access overrides coarse CEO grants','granular',{action:'owner_data',data_action:'ceo_commands'},403],
 ['reply access cannot resolve support cases','granular',{action:'owner_data',data_action:'support_action',operation:'UPDATE',status:'resolved'},403],
 ['generic provider status changes are rejected','root',{action:'owner_data',data_action:'operation_execute',operation:'WHATSAPP_SET_STATUS'},400],
]) test(name,async()=>{
 let handler;
 const session={authenticated:true,actor_user_id:'ccbe8166-d3f4-4058-a178-78ad348520f7',authority_role:scenario==='root'?'ROOT_OWNER':'OWNER_DELEGATE',permissions:['manage_ceo_commands','manage_support'],granular_permissions:['support.reply'],access_scope:{type:scenario==='scoped'?'OWN_TASKS_ONLY':'ALL_BUSINESSES'}};
 const fetch=async url=>{
  assert.ok(new URL(url).pathname.endsWith('/dabbir_owner_session_verify_v1'),'no downstream RPC may execute after a denied request');
  if(scenario==='network')throw new Error('isolated network failure');
  return Response.json(scenario==='invalid'?{authenticated:false}:scenario==='malformed'?{}:session,{status:scenario==='outage'?503:200});
 };
 vm.runInContext(stripTypeScriptTypes(source),vm.createContext({Deno:{env:{get:name=>name==='SUPABASE_URL'?'https://isolated.invalid':'test-key'},serve:fn=>{handler=fn}},fetch,crypto:webcrypto,Response,Request,TextEncoder,Uint8Array,Uint32Array,btoa,console,performance}));
 const response=await handler(new Request('https://isolated.invalid',{method:'POST',body:JSON.stringify({...body,session_token:'isolated-session-token-at-least-24-characters'})}));
 assert.equal(response.status,expected);assert.equal((await response.json()).ok,false);
});

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
