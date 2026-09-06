import { Readable } from 'node:stream';
import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_URL='https://booking-fixture.invalid';
const {default:handler}=await import('../api/appointment-management.js');
const B='10000000-0000-4000-8000-000000000001',BR='20000000-0000-4000-8000-000000000001',OTHER_BR='20000000-0000-4000-8000-000000000002',ID='30000000-0000-4000-8000-000000000001',USER='40000000-0000-4000-8000-000000000001';
const appointment={id:ID,business_id:B,branch_id:BR,customer_id:null,status:'confirmed',starts_at:'2026-09-03T10:00:00.000Z',ends_at:'2026-09-03T11:00:00.000Z'};
const response=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});
function fixture(t,{role='owner',denyWrite=false}={}){
  const calls=[];
  t.mock.method(globalThis,'fetch',async(input,options={})=>{
    const url=new URL(input),path=url.pathname;
    calls.push({url,method:options.method||'GET',options,body:options.body?JSON.parse(options.body):null});
    if(path==='/auth/v1/user')return response({id:USER});
    if(path.endsWith('/account_access_state'))return response([{status:'active'}]);
    if(path.endsWith('/dabbir_memberships'))return response([{business_id:B,status:'active',role,permissions:[]}]);
    if(path.endsWith('/dabbir_business_branches'))return response([{id:BR,business_id:B,status:'active'},{id:OTHER_BR,business_id:B,status:'active'}]);
    if(path.endsWith('/dabbir_membership_branches'))return response([{business_id:B,user_id:USER,branch_id:BR}]);
    if(path.endsWith('/dabbir_businesses'))return response([{id:B,timezone:'Asia/Dubai',locale:'ar-AE'}]);
    if(path.endsWith('/dabbir_appointments')){
      if(options.method==='PATCH')return denyWrite?response({code:'42501',message:'denied'},403):response([{...appointment,...JSON.parse(options.body)}]);
      return response([appointment],200,{'content-range':'50-50/51'});
    }
    throw new Error('UNEXPECTED_FIXTURE_REQUEST '+path);
  });
  return calls;
}
async function invoke({method='GET',url='/',body,authorized=true}={}){
  const req=Object.assign(Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]),{method,url,headers:{host:'app.fixture.invalid',origin:'https://app.fixture.invalid',...(authorized?{cookie:'__Host-dabbir_access=fixture-session'}:{})},body});
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},end(text){this.body=JSON.parse(text)}};
  await handler(req,res);return res;
}
test('scoped reads page after server filtering and retain authenticated RLS, business and branch fences',async t=>{
  const calls=fixture(t),res=await invoke({url:`/?business_id=${B}&branch_id=${BR}&scope=review&offset=50`});
  assert.equal(res.statusCode,200);assert.equal(res.body.total,51);assert.equal(res.body.next_offset,51);assert.equal(res.body.has_more,false);
  assert.equal(res.body.branch_id,BR);assert.equal(res.headers['cache-control'],'no-store');
  const read=calls.find(x=>x.url.pathname.endsWith('/dabbir_appointments'));
  assert.equal(read.url.searchParams.get('business_id'),'eq.'+B);assert.equal(read.url.searchParams.get('branch_id'),'eq.'+BR);
  assert.equal(read.url.searchParams.get('offset'),'50');assert.equal(read.url.searchParams.get('limit'),'50');
  assert.match(read.url.searchParams.get('and'),/status\.not\.in\.\(completed,cancelled,no_show\)/);
  assert.equal(read.options.headers.get('authorization'),'Bearer fixture-session');
  assert.equal(read.options.headers.get('prefer'),'count=exact');
  assert.equal(calls.some(x=>x.method!=='GET'),false);
});
test('unauthenticated and foreign-business reads fail closed',async t=>{
  const calls=fixture(t);
  assert.equal((await invoke({authorized:false})).statusCode,401);
  assert.equal((await invoke({url:'/?business_id=10000000-0000-4000-8000-000000000099&scope=history'})).statusCode,403);
  assert.equal(calls.some(x=>x.url.pathname.endsWith('/dabbir_appointments')),false);
});
test('restricted staff cannot read another branch or all branches',async t=>{
  const calls=fixture(t,{role:'employee'});
  assert.equal((await invoke({url:`/?business_id=${B}&branch_id=${OTHER_BR}&scope=history`})).statusCode,403);
  assert.equal((await invoke({url:`/?business_id=${B}&branch_id=all&scope=history`})).statusCode,403);
  assert.equal(calls.some(x=>x.url.pathname.endsWith('/dabbir_appointments')),false);
});
test('historical no-show resolution writes only the selected status, never an invented duration or completion',async t=>{
  const calls=fixture(t),res=await invoke({method:'POST',body:{action:'update',business_id:B,branch_id:BR,appointment_id:ID,status:'no_show',starts_at:appointment.starts_at}});
  assert.equal(res.statusCode,200);assert.equal(res.body.appointment.status,'no_show');
  assert.deepEqual(calls.find(x=>x.method==='PATCH').body,{status:'no_show'});
  assert.equal(res.body.appointment.ends_at,appointment.ends_at);
});
test('stale branch mutations and RLS write rejection cannot report persistence',async t=>{
  const calls=fixture(t,{denyWrite:true});
  let res=await invoke({method:'POST',body:{action:'update',business_id:B,branch_id:OTHER_BR,appointment_id:ID,status:'completed'}});
  assert.equal(res.statusCode,403);assert.equal(calls.some(x=>x.method==='PATCH'),false);
  res=await invoke({method:'POST',body:{action:'update',business_id:B,branch_id:BR,appointment_id:ID,status:'completed'}});
  assert.equal(res.statusCode,403);assert.equal(res.body.ok,false);
});
test('untrusted lifecycle filters and pagination arguments are rejected',async t=>{
  const calls=fixture(t);
  for(const query of ['scope=history)%2Cor(status.eq.confirmed','scope=current&offset=-1','scope=current&from=2026-02-30&to=2026-03-01']){
    const res=await invoke({url:`/?business_id=${B}&branch_id=${BR}&${query}`});assert.equal(res.statusCode,400);
  }
  assert.equal(calls.some(x=>x.url.pathname.endsWith('/dabbir_appointments')),false);
});
