import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {ownerFixture,ID} from './fixtures/owner-broker.mjs';
process.env.DABBIR_OWNER_BROKER_URL='https://owner-broker.test';
const handlers=Object.fromEntries(await Promise.all(['owner-dashboard-data','owner-action-bridge','owner-support-bridge','owner-team','owner-ceo-command','owner-decision','owner-incident-center','owner-dashboard-gateway'].map(async name=>[name,(await import('../api/'+name+'.js')).default])));
const {ownerBroker}=await import('../api/_owner-broker-client.js');
export async function invoke(name,{method='GET',url='/api/'+name,body,cookie='__Host-dabbir_owner_session=fixture',origin='https://dabbir.example'}={}){
 const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);Object.assign(req,{method,url,headers:{host:'dabbir.example',origin,cookie}});
 const out={headers:{},statusCode:0,body:null,setHeader(k,v){this.headers[k.toLowerCase()]=v},end(v){this.text=String(v||'');try{this.body=JSON.parse(this.text)}catch{}}};
 await handlers[name](req,out);return out;
}
function fixture(t){const f=ownerFixture();t.mock.method(globalThis,'fetch',f.fetchBroker);return f}
test('customer reply validates its persisted message receipt and reads the same scoped case',async t=>{
 const f=fixture(t);f.state.cases.push({id:ID.case,customer_no:'DAB-900001',customer_visible:true,notes:[],messages:[]});
 const response=await invoke('owner-support-bridge',{method:'POST',body:{operation:'REPLY_CUSTOMER',case_id:ID.case,customer_no:'DAB-900001',note:'Synthetic customer-visible reply'}});
 assert.equal(response.statusCode,200);assert.equal(response.body.readback_verified,true);
 assert.equal(f.state.cases[0].notes.length,0);assert.equal(f.state.cases[0].messages[0].body,'Synthetic customer-visible reply');
 assert.equal((await invoke('owner-support-bridge',{method:'POST',body:{operation:'REPLY_CUSTOMER',case_id:ID.case,note:'Missing customer'}})).statusCode,400);
});
for(const name of Object.keys(handlers))test(name+' rejects an absent or malformed session without contacting the broker',async t=>{
 const f=fixture(t);for(const cookie of ['', '__Host-dabbir_owner_session=%zz']){const r=await invoke(name,{cookie});assert.equal(r.statusCode,name==='owner-dashboard-gateway'?302:name==='owner-action-bridge'?405:401)}assert.equal(f.calls.length,0);
});
test('same-origin mutation is mandatory and null/array JSON bodies fail closed',async t=>{
 const f=fixture(t);
 for(const name of ['owner-action-bridge','owner-support-bridge','owner-team','owner-ceo-command','owner-decision','owner-incident-center']){
  assert.equal((await invoke(name,{method:'POST',origin:'https://attacker.example',body:{}})).statusCode,403);
  for(const body of [null,[]])assert.equal((await invoke(name,{method:'POST',body})).statusCode,400,name);
 }assert.equal(f.calls.length,0);
});
test('request body cannot replace the cookie, broker command, or team operation',async t=>{
 const f=fixture(t);await ownerBroker({headers:{cookie:'__Host-dabbir_owner_session=bound-cookie'}},'identity',{session_token:'attacker',action:'owner_otp_request',data_action:'team'});
 assert.deepEqual(f.calls[0],{session_token:'bound-cookie',action:'owner_data',data_action:'identity'});
});
test('HTTP errors and malformed broker JSON cannot be reported as success',async t=>{
 for(const response of [new Response('{'),new Response(JSON.stringify({ok:true}),{status:500}),new Response(JSON.stringify({ok:false,error:'DENIED'}))]){
  t.mock.method(globalThis,'fetch',async()=>response);
  const call=await ownerBroker({headers:{cookie:'__Host-dabbir_owner_session=x'}},'identity');assert.equal(call.payload.ok,false);assert.ok(call.status>=500);t.mock.restoreAll();
 }
});
test('gateway verifies authority, escapes identity, and preserves cookie on transient failure',async t=>{
 const f=fixture(t);f.state.identity.display_name='</script><script>alert(1)</script>';
 let out=await invoke('owner-dashboard-gateway');assert.equal(out.statusCode,200);assert.doesNotMatch(out.text,/must-never-render|<script>alert\(1\)/);assert.match(out.text,/\\u003c\/script>/);
 f.state.fail='verify';out=await invoke('owner-dashboard-gateway');assert.equal(out.statusCode,503);assert.equal(out.headers['set-cookie'],undefined);
 out=await invoke('owner-dashboard-gateway',{cookie:'__Host-dabbir_owner_session=expired'});assert.equal(out.statusCode,302);assert.match(out.headers['set-cookie'],/Max-Age=0/);
});
test('all canonical read actions use their live broker envelope',async t=>{
 const f=fixture(t);for(const action of ['overview','executive','identity','search','operations','feedback','audit','customer360','operation_entities']){
  const params=new URLSearchParams({action,user_id:ID.customer,business_id:ID.business,entity_type:'PRODUCT'});
  const out=await invoke('owner-dashboard-data',{url:'/api/owner-dashboard-data?'+params});assert.equal(out.statusCode,200,action);assert.equal(out.body.ok,true);
  f.state.bad=action;assert.equal((await invoke('owner-dashboard-data',{url:'/api/owner-dashboard-data?'+params})).statusCode,502,action);f.state.bad=null;
 }
});
test('operation persists, returns an audit receipt and verifies the exact entity field',async t=>{
 const f=fixture(t),body={business_id:ID.business,entity_id:ID.entity,action:'PRODUCT_SET_ACTIVE',reason:'QA regression reason',confirmation:'EXECUTE PRODUCT_SET_ACTIVE',payload:{active:false}};
 const out=await invoke('owner-action-bridge',{method:'POST',body});assert.equal(out.statusCode,200);assert.equal(out.body.readback_verified,true);assert.equal(f.state.entities.PRODUCT[0].active,false);assert.equal(out.body.result.audit_id,ID.audit);assert.equal(f.state.audit.length,1);
 f.state.readbackFail=true;const partial=await invoke('owner-action-bridge',{method:'POST',body:{...body,payload:{active:true}}});assert.equal(partial.body.ok,true);assert.equal(partial.body.readback_verified,false);assert.equal(partial.body.retry_safe,false);
});
test('unsafe lifecycle actions, unknown actions and malformed values never execute',async t=>{
 const f=fixture(t),base={business_id:ID.business,entity_id:ID.entity,reason:'QA test reason',payload:{active:true}};
 for(const action of ['WHATSAPP_SET_STATUS','ORDER_SET_STATUS','BOOKING_SET_STATUS','__proto__','CONSTRUCTOR'])assert.equal((await invoke('owner-action-bridge',{method:'POST',body:{...base,action,confirmation:'EXECUTE '+action}})).statusCode,400);
 for(const payload of [{active:'false'},{active:null}])assert.equal((await invoke('owner-action-bridge',{method:'POST',body:{...base,action:'PRODUCT_SET_ACTIVE',confirmation:'EXECUTE PRODUCT_SET_ACTIVE',payload}})).statusCode,400);
 assert.equal(f.calls.length,0);
});
test('support create, note and resolution round-trip through the existing RPC and notes',async t=>{
 const f=fixture(t);for(const body of [{operation:'CREATE',target_user_id:ID.customer,customer_no:'DAB-900001',business_id:ID.business,subject:'QA support',note:'First note',priority:'normal'},{operation:'ADD_NOTE',case_id:ID.case,customer_no:'DAB-900001',note:'Second note'},{operation:'UPDATE',case_id:ID.case,customer_no:'DAB-900001',status:'resolved',resolution:'QA resolved'}]){
  const out=await invoke('owner-support-bridge',{method:'POST',body});assert.equal(out.statusCode,200);assert.equal(out.body.readback_verified,true);
 }assert.equal(f.state.cases[0].notes.length,2);assert.equal(f.state.cases[0].status,'resolved');assert.equal(f.state.audit.length,3);
});
test('CEO create and each lifecycle mutation have independent readback results',async t=>{
 const f=fixture(t);let out=await invoke('owner-ceo-command',{method:'POST',body:{operation:'create',command_text:'Create fixture mission',objective:'QA objective',priority:'P2',acceptance_criteria:['QA evidence']}});assert.equal(out.body.readback_verified,true);
 for(const body of [{operation:'reprioritize',priority:'P0'},{operation:'set_due_at',due_at:'2026-09-08T12:00:00Z'},{operation:'set_due_at',due_at:null},{operation:'add_guidance',guidance:'QA guidance'},{operation:'cancel'},{operation:'resume'}]){out=await invoke('owner-ceo-command',{method:'POST',body:{...body,command_id:ID.command}});assert.equal(out.body.readback_verified,true,body.operation)}
 f.state.bad='ceo_command_update';out=await invoke('owner-ceo-command',{method:'POST',body:{operation:'cancel',command_id:ID.command}});assert.equal(out.statusCode,502);assert.equal(out.body.retry_safe,false);
});
test('owner decision success requires the resolved decision and matching readback',async t=>{
 fixture(t);const out=await invoke('owner-decision',{method:'POST',body:{escalation_id:ID.decision,resolution:'modify',note:'QA modification'}});assert.equal(out.statusCode,200);assert.equal(out.body.readback_verified,true);assert.equal(out.body.decision.decision.resolution,'modify');
});
test('incident create and update verify persisted state',async t=>{
 fixture(t);let out=await invoke('owner-incident-center',{method:'POST',body:{operation:'create',customer_no:'DAB-900001',business_id:ID.business,category:'GENERAL',priority:'normal',summary:'QA incident',assigned_queue:'owner'}});assert.equal(out.body.readback_verified,true);
 out=await invoke('owner-incident-center',{method:'POST',body:{operation:'update',incident_id:ID.case,status:'resolved',resolution:'QA resolved'}});assert.equal(out.body.readback_verified,true);
});
test('team resend uses the server email key and verifies delivery without real mail',async t=>{
 const f=fixture(t);process.env.RESEND_API_KEY='synthetic-test-only';
 let out=await invoke('owner-team',{method:'POST',body:{operation:'invite',email:'qa@example.invalid',role_code:'CUSTOM',resend_key:'injected'}});assert.equal(out.body.readback_verified,true);
 out=await invoke('owner-team',{method:'POST',body:{operation:'invite_resend',invitation_id:ID.case,resend_key:'injected'}});assert.equal(out.body.readback_verified,true);
 assert.equal(f.calls.findLast(c=>c.operation==='invite_resend').resend_key,'synthetic-test-only');delete process.env.RESEND_API_KEY;
 out=await invoke('owner-team',{method:'POST',body:{operation:'suspend',target_user_id:ID.root}});assert.equal(out.statusCode,403);
});
