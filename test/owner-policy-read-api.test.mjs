import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
process.env.SUPABASE_URL='https://policy-read-fixture.invalid';
process.env.SUPABASE_AUTH_URL=process.env.SUPABASE_URL;
process.env.SUPABASE_DATA_URL=process.env.SUPABASE_URL;
const { default: handler }=await import('../api/owner-decision-memory.js');
const business='10000000-0000-4000-8000-000000000001',user='20000000-0000-4000-8000-000000000001';
const response=(body,status=200)=>new Response(JSON.stringify(body),{status});
function fixture(t,{role='owner',permanent=false,mutation=false}={}){
 const calls=[];let reads=0;
 t.mock.method(console,'warn',()=>{});
 t.mock.method(globalThis,'fetch',async(input,options={})=>{
  const url=new URL(input),table=url.pathname.split('/').at(-1);calls.push({url,options});
  if(table==='user')return response({id:user});
  if(table==='account_access_state')return response([{status:'active'}]);
  if(table==='dabbir_memberships')return response([{business_id:business,role,status:'active'}]);
  assert.equal(options.headers.get('authorization'),'Bearer fixture-token');
  if(table==='dabbir_owner_policy_candidates'){
   assert.deepEqual(JSON.parse(options.body),{p_business_id:business});reads++;
   return permanent||reads===1?response({code:'57014',message:'private SQL customer details'},500):response([]);
  }
  if(table==='dabbir_activate_owner_policy'&&mutation)return response({message:'private error'},503);
  assert.equal(url.searchParams.get('business_id'),'eq.'+business);assert.equal(url.searchParams.get('limit'),'50');return response([]);
 });return calls;
}
async function invoke(method='GET',body={}){
 const req=Readable.from(method==='POST'?[Buffer.from(JSON.stringify({business_id:business,...body}))]:[]);
 Object.assign(req,{method,url:'/?business_id='+business,headers:{host:'dabbir.test',origin:'https://dabbir.test',cookie:'__Host-dabbir_access=fixture-token'}});
 const res={setHeader(){},end(s){this.body=JSON.parse(s)}};await handler(req,res);return res;
}
test('authorized policy GET retries only the failed scoped read and returns verified rows',async t=>{
 const calls=fixture(t);const res=await invoke();assert.equal(res.statusCode,200);assert.equal(res.body.business_id,business);assert.deepEqual(res.body.candidates,[]);
 assert.equal(calls.filter(x=>x.url.pathname.endsWith('dabbir_owner_policy_candidates')).length,2);
 assert.equal(calls.filter(x=>x.url.pathname.endsWith('dabbir_owner_policy_audit')).length,1);
});
test('persistent read failure is 503, never 400 or an empty successful policy list',async t=>{
 fixture(t,{permanent:true});const res=await invoke();assert.equal(res.statusCode,503);assert.deepEqual(res.body,{ok:false,error:'OWNER_POLICY_READ_UNAVAILABLE'});
});
test('employee is rejected before the read retry path',async t=>{
 const calls=fixture(t,{role:'employee'});assert.equal((await invoke()).statusCode,403);assert.equal(calls.filter(x=>x.url.pathname.includes('policy')).length,0);
});
test('policy activation failure is never retried by read resilience',async t=>{
 const calls=fixture(t,{mutation:true});const res=await invoke('POST',{action:'activate',action_key:'handoff.owner_decision.continue_ai',decision_key:'continue_ai',decision_value:'yes'});
 assert.equal(res.body.ok,false);assert.equal(calls.filter(x=>x.url.pathname.endsWith('dabbir_activate_owner_policy')).length,1);
});
