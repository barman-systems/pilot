import assert from 'node:assert/strict';
import test from 'node:test';
const priorUrl=process.env.SUPABASE_URL;
process.env.SUPABASE_URL='https://billing-qa.invalid';
const {reconcileDate}=await import('../api/dabbir-ai-billing-reconcile-cron.js');
if(priorUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=priorUrl;

const active='10000000-0000-4000-8000-000000000001';
const deleted='20000000-0000-4000-8000-000000000002';
const foreign='30000000-0000-4000-8000-000000000003';
const row=(user,total_cost)=>({user,total_cost,input_tokens:10,output_tokens:5,request_count:1});
async function exercise({users=[row(deleted,.003),row(active,.0025)],lookup=[{id:active}],lookupStatus=200,ledgerStatus=200,modelStatus=200}={}){
 const previous=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,options={})=>{
  const u=new URL(url);calls.push({url:u,options});
  if(u.pathname==='/v1/report')return new Response(JSON.stringify({results:u.searchParams.get('group_by')==='user'?users:[{model:'google/gemini-3.7-flash',total_cost:.0025,input_tokens:10,output_tokens:5,request_count:1}]}),{status:u.searchParams.get('group_by')==='user'?200:modelStatus});
  if(u.pathname.endsWith('/dabbir_businesses'))return new Response(JSON.stringify(lookup),{status:lookupStatus});
  if(u.pathname.endsWith('/dabbir_reconcile_ai_gateway_cost_v1'))return new Response(JSON.stringify({ok:ledgerStatus===200}),{status:ledgerStatus});
  throw Error('UNEXPECTED_TRANSPORT');
 };
 try{return {result:await reconcileDate('synthetic-gateway-token','synthetic-service-key','2026-09-10'),calls};}
 catch(error){error.calls=calls;throw error;}
 finally{globalThis.fetch=previous;}
}
const ledgerCalls=calls=>calls.filter(c=>c.url.pathname.endsWith('/dabbir_reconcile_ai_gateway_cost_v1'));

test('deleted report identity does not stop an existing business or transfer its spend',async()=>{
 const {result,calls}=await exercise();
 assert.deepEqual(result,{date:'2026-09-10',businesses:1,models:1,total_microusd:2500,unattributed_businesses:1,unattributed_microusd:3000});
 const writes=ledgerCalls(calls);assert.equal(writes.length,1);
 const body=JSON.parse(writes[0].options.body);assert.equal(body.p_business_id,active);assert.equal(body.p_actual_cost_microusd,2500);
 assert.ok(!calls.some(c=>c.url.searchParams.get('user_id')===deleted));
});
test('fully attributable billing preserves existing exact-cost reconciliation',async()=>{
 const {result,calls}=await exercise({users:[row(active,.0025)]});
 assert.equal(result.unattributed_businesses,0);assert.equal(result.unattributed_microusd,0);
 assert.equal(result.total_microusd,2500);assert.equal(ledgerCalls(calls).length,1);
});
test('unavailable business lookup fails closed before any cost ledger write',async()=>{
 await assert.rejects(exercise({lookupStatus:503}),error=>{
  assert.equal(error.message,'AI_BILLING_BUSINESS_LOOKUP_HTTP_503');assert.equal(ledgerCalls(error.calls).length,0);return true;
 });
});
test('malformed or foreign lookup identity is not treated as verified attribution',async()=>{
 for(const lookup of [{error:'not rows'},[{id:foreign}]])await assert.rejects(exercise({lookup}),error=>{
  assert.equal(error.message,'AI_BILLING_BUSINESS_LOOKUP_INVALID');assert.equal(ledgerCalls(error.calls).length,0);return true;
 });
});
test('an existing business ledger rejection is still an error',async()=>{
 await assert.rejects(exercise({ledgerStatus:400}),error=>{
  assert.equal(error.message,'AI_BILLING_LEDGER_HTTP_400');assert.equal(ledgerCalls(error.calls).length,1);return true;
 });
});
test('model report failure is not mistaken for deleted-tenant spend',async()=>{
 await assert.rejects(exercise({modelStatus:429}),error=>{
  assert.equal(error.message,'AI_GATEWAY_REPORT_HTTP_429');assert.equal(ledgerCalls(error.calls).length,0);return true;
 });
});
test('unattributed report spend stays visible with zero invented customer writes',async()=>{
 const {result,calls}=await exercise({users:[row(deleted,.003),row('unmapped-provider-user',.001)],lookup:[]});
 assert.equal(result.businesses,0);assert.equal(result.total_microusd,0);assert.equal(result.unattributed_businesses,2);assert.equal(result.unattributed_microusd,4000);
 assert.equal(ledgerCalls(calls).length,0);
});
