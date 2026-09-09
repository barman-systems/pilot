import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the actual token-issuer functions without executing either
// production journey, creating identities, or handling a real credential.
function issuer(file,rawFetch,env={ACTIONS_ID_TOKEN_REQUEST_URL:'https://issuer.invalid/token',ACTIONS_ID_TOKEN_REQUEST_TOKEN:'fixture-only'}){
 const source=fs.readFileSync(new URL(file,import.meta.url),'utf8');
 const start=source.indexOf('async function getGitHubOidcToken()');
 const end=source.indexOf('\nasync function qaControl(',start);
 assert.ok(start>=0&&end>start);
 return vm.runInNewContext(source.slice(start,end)+'\ngetGitHubOidcToken;',{
  rawFetch,process:{env},OIDC_AUDIENCE:'dabbir-ai-qa',assert:(v,m)=>assert.ok(v,m),small:()=> '[redacted]',
  // Simulates the previous runner's stale global cache, so this regression
  // fails against the old function instead of merely mirroring its source.
  oidcToken:null,
 });
}

for(const file of ['./ai-full-customer-journey-v2.mjs','./dabbir-cross-tenant-isolation.mjs']){
 test(file+': cleanup obtains fresh authority after the bootstrap token expires',async()=>{
  let now=0,calls=0;
  const get=issuer(file,async(url,options)=>{
   calls++;assert.match(url,/audience=dabbir-ai-qa$/);assert.equal(options.headers.authorization,'Bearer fixture-only');
   return {ok:true,status:200,json:{value:'fixture-issued-at-'+now}};
  });
  const bootstrap=await get();now=360000;const cleanup=await get();
  assert.notEqual(cleanup,bootstrap);assert.equal(cleanup,'fixture-issued-at-360000');assert.equal(calls,2);
 });
 test(file+': issuer failure never reuses previously issued authority',async()=>{
  let calls=0;const get=issuer(file,async()=>++calls===1?{ok:true,status:200,json:{value:'fixture-expired'}}:{ok:false,status:401,json:{},text:'secret-issuer-error'});
  await get();await assert.rejects(get(),/GITHUB_OIDC_ISSUE_FAILED_401/);assert.equal(calls,2);
 });
 test(file+': missing GitHub Actions identity fails before transport',async()=>{
  let calls=0;const get=issuer(file,async()=>{calls++;throw Error('unexpected request');},{});
  await assert.rejects(get(),/GITHUB_ACTIONS_OIDC_CONTEXT_REQUIRED/);assert.equal(calls,0);
 });
}
