import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const source=readFileSync(resolve(here,'../api/owner-action-center.js'),'utf8');

function must(pattern,message){assert.match(source,pattern,message)}
function mustNot(pattern,message){assert.doesNotMatch(source,pattern,message)}

test('Today view validates membership before trusting local claims',()=>{
  const membershipIndex=source.indexOf('memberships=await getBusinessMemberships(token)');
  const claimsIndex=source.indexOf('userClaimsFromValidatedAccessToken(token)');
  assert.ok(membershipIndex>=0,'membership validation must exist');
  assert.ok(claimsIndex>membershipIndex,'claims may be read only after Supabase Data API accepts the token');
  must(/userClaimsFromValidatedAccessToken/,'validated-token helper must be imported');
});

test('Today view keeps Auth server only as compatibility fallback',()=>{
  const claimsIndex=source.indexOf('userClaimsFromValidatedAccessToken(token)');
  const fallbackIndex=source.indexOf('getVerifiedUser(token)');
  assert.ok(fallbackIndex>claimsIndex,'/auth/v1/user fallback must happen only after claims parsing fails');
  must(/if\(!user\)user=await getVerifiedUser\(token\)\.catch\(\(\)=>null\)/,'fallback must be narrow and explicit');
  mustNot(/Promise\.all\(\[\s*getVerifiedUser\(token\)/,'hot path must not call Auth and membership lookup in parallel');
});

test('Today view fails closed when membership verification is unavailable',()=>{
  must(/status===401\|\|status===403/,'401/403 membership failures must remain authentication failures');
  must(/AUTH_VERIFICATION_UNAVAILABLE/,'non-auth upstream failures must fail closed as unavailable');
  mustNot(/getBusinessMemberships\(token\)\.catch\(\(\)=>\[\]\)/,'membership failures must not silently become an empty tenant list');
});

test('Today view exposes production-verifiable fast-path evidence',()=>{
  must(/x-dabbir-owner-action-center-auth','fast-v1'/,'response header must identify fast-path contract');
  must(/auth_fast_path:true/,'response truth block must expose fast-path state');
});
