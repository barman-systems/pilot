import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
process.env.SUPABASE_URL='https://knowledge-fixture.invalid';
process.env.SUPABASE_AUTH_URL=process.env.SUPABASE_URL;
process.env.SUPABASE_DATA_URL=process.env.SUPABASE_URL;
const {default:handler}=await import('../api/understanding-knowledge.js');
const business='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',user='20000000-0000-4000-8000-000000000001',target='30000000-0000-4000-8000-000000000001';
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status});
function fixture(t,{role='owner',suspended=false,failed,malformed,services=[{id:target,name:'Wash',active:true}],rpcFailure=false}={}){
  const calls=[];t.mock.method(globalThis,'fetch',async(input,options={})=>{
    const url=new URL(input),table=url.pathname.split('/').at(-1);calls.push({url,options});
    if(table==='user')return reply({id:user});
    if(table==='account_access_state')return reply([{status:suspended?'suspended':'active'}]);
    if(table==='dabbir_memberships')return reply([{business_id:business,role,status:'active'}]);
    assert.equal(options.headers.get('authorization'),'Bearer fixture-token');
    if(table.startsWith('dabbir_knowledge_'))return rpcFailure?reply({message:'TARGET_NOT_ACTIVE'},400):reply({id:target,status:'PROPOSED',active:false});
    assert.equal(url.searchParams.get('business_id'),'eq.'+business);
    assert.ok(Number(url.searchParams.get('limit'))<=201);
    assert.doesNotMatch(url.searchParams.get('select'),/\*|body|customer|phone|email/);
    if(table===failed)return reply({message:'private database error'},503);
    if(table===malformed)return reply(null);
    return reply(table==='dabbir_services'?services:[]);
  });return calls;
}
async function invoke({method='GET',tenant=business,body={},origin='https://dabbir.test',auth=true}={}){
  const req=Readable.from(method==='POST'?[Buffer.from(JSON.stringify({business_id:tenant,...body}))]:[]);
  Object.assign(req,{method,url:'/?business_id='+tenant,headers:{host:'dabbir.test',origin,cookie:auth?'__Host-dabbir_access=fixture-token':''}});
  const res={headers:{},setHeader(k,v){this.headers[k]=v},end(s){this.body=JSON.parse(s)}};await handler(req,res);return res;
}
test('owner reads bounded service targets and privacy-safe audit through tenant-filtered JWT queries',async t=>{const calls=fixture(t);const r=await invoke();assert.equal(r.statusCode,200);assert.deepEqual(r.body.supported_entity_types,['service']);assert.equal(r.body.services[0].name,'Wash');assert.equal(r.headers['cache-control'],'no-store');assert.equal(calls.filter(c=>c.url.searchParams.has('business_id')).length,3)});
for(const [name,options,request,status] of [['anonymous',{}, {auth:false},401],['employee',{role:'employee'},{},403],['other tenant',{}, {tenant:other},403],['suspended owner',{suspended:true},{},401],['cross-origin',{}, {method:'POST',origin:'https://other.invalid'},403]])test(name+' cannot read targets or mutate knowledge',async t=>{const calls=fixture(t,options);assert.equal((await invoke(request)).statusCode,status);assert.equal(calls.filter(c=>c.url.pathname.includes('knowledge')||c.url.pathname.endsWith('dabbir_services')).length,0)});
for(const failed of ['dabbir_services','dabbir_ai_knowledge_proposals','dabbir_ai_understanding_events'])test(failed+' failure does not masquerade as empty knowledge',async t=>{fixture(t,{failed});const r=await invoke();assert.equal(r.body.ok,false);assert.equal(r.body.services,undefined);assert.doesNotMatch(JSON.stringify(r.body),/private database/)});
test('malformed upstream rows fail closed',async t=>{fixture(t,{malformed:'dabbir_services'});assert.equal((await invoke()).body.ok,false)});
test('saving proposal invokes only propose and never automatic approval',async t=>{const calls=fixture(t);const r=await invoke({method:'POST',body:{action:'propose',entity_type:'service',alias:' VIP ',target_id:target}});assert.equal(r.statusCode,200);assert.equal(r.body.result.active,false);const writes=calls.filter(c=>c.options.method==='POST');assert.equal(writes.length,1);assert.match(writes[0].url.pathname,/dabbir_knowledge_propose_v2$/);assert.equal(JSON.parse(writes[0].options.body).p_alias,'VIP')});

test('owner correction grounds a service then creates only an inactive proposal; caller target and alias cannot override it',async t=>{
 const calls=fixture(t);const r=await invoke({method:'POST',body:{action:'propose_correction',correction:'VIP means Wash',target_id:other,alias:'forged',entity_type:'branch'}});
 assert.equal(r.statusCode,200);assert.equal(r.body.result.active,false);
 const catalog=calls.find(c=>c.url.pathname.endsWith('dabbir_services'));assert.equal(catalog.url.searchParams.get('active'),'eq.true');assert.equal(catalog.url.searchParams.get('limit'),'201');
 const writes=calls.filter(c=>c.options.method==='POST');assert.equal(writes.length,1);assert.match(writes[0].url.pathname,/dabbir_knowledge_propose_v2$/);
 const args=JSON.parse(writes[0].options.body);assert.equal(args.p_alias,'VIP');assert.equal(args.p_target_id,target);assert.equal(args.p_entity_type,'service');assert.doesNotMatch(writes[0].options.body,/means|correction"|forged/);
});
for(const [name,options,correction,error] of [
 ['negation',{},'VIP does not mean Wash','CORRECTION_FORMAT_REQUIRED'],
 ['unknown name',{},'VIP means Gold','CORRECTION_SERVICE_NOT_FOUND'],
 ['ambiguous target',{services:[{id:target,name:'Wash',active:true},{id:other,name:'Wash',active:true}]},'VIP means Wash','CORRECTION_SERVICE_AMBIGUOUS'],
 ['inactive target',{services:[{id:target,name:'Wash',active:false}]},'VIP means Wash','CORRECTION_SERVICE_NOT_FOUND'],
 ['truncated catalog',{services:Array.from({length:201},()=>({id:target,name:'Wash',active:true}))},'VIP means Wash','CORRECTION_USE_SERVICE_PICKER'],
 ['catalog unavailable',{failed:'dabbir_services'},'VIP means Wash','KNOWLEDGE_REQUEST_FAILED'],
 ['malformed catalog',{malformed:'dabbir_services'},'VIP means Wash','KNOWLEDGE_REQUEST_FAILED'],
])test('correction '+name+' fails closed without a write',async t=>{const calls=fixture(t,options);const r=await invoke({method:'POST',body:{action:'propose_correction',correction}});assert.equal(r.statusCode,400);assert.equal(r.body.error,error);assert.equal(calls.filter(c=>c.options.method==='POST').length,0)});
for(const [name,options,request,status] of [['foreign tenant',{}, {tenant:other},403],['employee',{role:'employee'},{},403],['suspended owner',{suspended:true},{},401],['cross-origin',{}, {origin:'https://other.invalid'},403]])test('correction cannot bypass '+name+' guard',async t=>{const calls=fixture(t,options);const r=await invoke({method:'POST',body:{action:'propose_correction',correction:'VIP means Wash'},...request});assert.equal(r.statusCode,status);assert.equal(calls.filter(c=>c.url.pathname.endsWith('dabbir_services')||c.options.method==='POST').length,0)});
test('a target deactivated after catalog lookup is rejected by the existing RPC boundary',async t=>{fixture(t,{rpcFailure:true});const r=await invoke({method:'POST',body:{action:'propose_correction',correction:'VIP means Wash'}});assert.equal(r.statusCode,400);assert.equal(r.body.ok,false)});
test('invalid correction provenance is rejected before catalog lookup',async t=>{const calls=fixture(t);const r=await invoke({method:'POST',body:{action:'propose_correction',correction:'VIP means Wash',conversation_id:'forged'}});assert.equal(r.body.error,'INVALID_PROPOSAL');assert.equal(calls.filter(c=>c.url.pathname.endsWith('dabbir_services')).length,0)});
