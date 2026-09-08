import test from 'node:test';
import assert from 'node:assert/strict';
import { readOwnerPolicyRows } from '../api/_owner-policy-read.js';
const response=(data,status=200)=>new Response(JSON.stringify(data),{status});

for (const [name,failure] of [
  ['gateway',()=>response({message:'private upstream message'},503)],
  ['timeout',()=>response({code:'57014'},500)],
  ['connection',()=>{throw new TypeError('private connection details')}],
]) test(name+' read recovers once and returns actual rows',async()=>{
  let calls=0;const delays=[],logs=[];
  const result=await readOwnerPolicyRows(signal=>{assert.ok(signal instanceof AbortSignal);return ++calls===1?failure():response([{state:'ACTIVE'}]);},'policies',{wait:async n=>delays.push(n),log:(...x)=>logs.push(x)});
  assert.deepEqual(result,[{state:'ACTIVE'}]);assert.equal(calls,2);assert.deepEqual(delays,[150]);assert.deepEqual(logs,[]);
});
for (const [status,code,expected] of [[401,'PGRST301',401],[403,'42501',403],[400,'42883',502],[400,'private-token',502]]) test('permanent '+status+' '+code+' fails without retry or private details',async()=>{
  let calls=0;const logs=[];
  await assert.rejects(()=>readOwnerPolicyRows(()=>{calls++;return response({code,message:'private-token customer payload'},status)},'candidates',{wait:async()=>assert.fail('unexpected retry'),log:(...x)=>logs.push(x)}),{message:'OWNER_POLICY_READ_UNAVAILABLE',status:expected});
  assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(logs),/private-token|customer payload/);
});
test('persistent transient failure stops after two attempts with 503 and a safe source code',async()=>{
  let calls=0;const logs=[];
  await assert.rejects(()=>readOwnerPolicyRows(()=>{calls++;return response({code:'57014',message:'raw SQL'},500)},'audit',{wait:async()=>{},log:(...x)=>logs.push(x)}),{status:503});
  assert.equal(calls,2);assert.deepEqual(logs,[['dabbir_owner_policy_read_failed',{source:'audit',upstream_status:500,status:503,code:'57014',attempt:2}]]);
});
test('malformed successful response cannot masquerade as an empty policy list',async()=>{
  let calls=0;
  await assert.rejects(()=>readOwnerPolicyRows(()=>{calls++;return response(null)},'policies',{log:()=>{}}),{status:502});
  assert.equal(calls,1);
});
test('unknown source cannot enter the read-only retry path',async()=>{
  await assert.rejects(()=>readOwnerPolicyRows(()=>assert.fail('request must not run'),'activate'),/INVALID_POLICY_READ_SOURCE/);
});
test('owner revoked between membership lookup and database read remains a terminal authorization denial',async()=>{
 let calls=0;
 await assert.rejects(()=>readOwnerPolicyRows(()=>{calls++;return response({code:'P0001',message:'OWNER_REQUIRED'},400)},'candidates',{log:()=>{}}),{status:403});
 assert.equal(calls,1);
});
