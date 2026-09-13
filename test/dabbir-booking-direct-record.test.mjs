import test from 'node:test';
import assert from 'node:assert/strict';
import {createBookingLifecycle,installBookingReader} from '../api/_booking-lifecycle.js';

process.env.SUPABASE_URL='https://direct-booking-fixture.invalid';
process.env.SUPABASE_AUTH_URL=process.env.SUPABASE_URL;
process.env.SUPABASE_DATA_URL=process.env.SUPABASE_URL;
const {default:handler}=await import('../api/appointment-management.js');
const B='10000000-0000-4000-8000-000000000001',OTHER_B='10000000-0000-4000-8000-000000000002';
const BR='20000000-0000-4000-8000-000000000001',OTHER_BR='20000000-0000-4000-8000-000000000002';
const U='40000000-0000-4000-8000-000000000001',C='50000000-0000-4000-8000-000000000001';
const id=n=>'30000000-0000-4000-8000-'+String(n).padStart(12,'0');
const appointment=(n,extra={})=>({id:id(n),business_id:B,branch_id:BR,customer_id:C,starts_at:new Date(Date.parse('2030-01-15T06:00:00Z')+n*60000).toISOString(),ends_at:'2030-01-15T16:00:00Z',status:'confirmed',...extra});
const response=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});

function apiFixture(t,{role='owner',failure=false,rows=Array.from({length:75},(_,n)=>appointment(n+1))}={}){
  const calls=[];
  t.mock.method(globalThis,'fetch',async(input,options={})=>{
    const url=new URL(input),table=url.pathname.split('/').at(-1);calls.push({url,options});
    if(url.pathname==='/auth/v1/user')return response({id:U});
    if(table==='account_access_state')return response([{status:'active'}]);
    if(table==='dabbir_memberships')return response([{business_id:B,role,status:'active',permissions:[]}]);
    if(table==='dabbir_business_branches')return response([{id:BR,business_id:B,status:'active'},{id:OTHER_BR,business_id:B,status:'active'}]);
    if(table==='dabbir_membership_branches')return response([{business_id:B,user_id:U,branch_id:BR}]);
    if(table==='dabbir_businesses')return response([{id:B,timezone:'Asia/Dubai',country_code:'AE'}]);
    if(table==='dabbir_customers')return response([{id:C,display_name:'عميل الموعد'}]);
    if(table==='dabbir_appointments'){
      assert.equal(options.method||'GET','GET');assert.equal(options.headers.get('authorization'),'Bearer fixture-session');
      if(failure)return response({message:'unavailable'},503);
      let result=rows.slice();
      for(const key of ['id','business_id','branch_id']){const filter=url.searchParams.get(key);if(filter)result=result.filter(row=>'eq.'+row[key]===filter)}
      const filter=url.searchParams.get('and')||'';
      if(filter.includes('status.not.in.'))result=result.filter(row=>!['completed','cancelled','no_show'].includes(row.status));
      else if(filter.includes('status.in.'))result=result.filter(row=>['completed','cancelled','no_show'].includes(row.status));
      const total=result.length,offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||50);
      result=result.slice(offset,offset+limit);
      return response(result,200,{'content-range':result.length?`${offset}-${offset+result.length-1}/${total}`:`*/${total}`});
    }
    throw new Error('UNEXPECTED_REQUEST '+table);
  });
  return calls;
}
async function invoke(query,{authorized=true}={}){
  const req={method:'GET',url:'/?'+query,headers:{cookie:authorized?'__Host-dabbir_access=fixture-session':''}};
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},end(body){this.body=JSON.parse(body)}};
  await handler(req,res);return res;
}

test('GET appointment_id fetches a record beyond the first 50 without changing the requested scope',async t=>{
  const calls=apiFixture(t),base=`business_id=${B}&branch_id=${BR}&scope=current&from=2030-01-15&to=2030-01-16`;
  const page=await invoke(base);assert.equal(page.body.appointments.length,50);assert.equal(page.body.appointments.some(row=>row.id===id(75)),false);
  const record=await invoke(base+'&appointment_id='+id(75));
  assert.equal(record.statusCode,200);assert.equal(record.body.appointment.id,id(75));assert.equal(record.body.scope,'current');assert.equal(record.body.branch_id,BR);
  const read=calls.filter(call=>call.url.pathname.endsWith('/dabbir_appointments')).at(-1);
  assert.equal(read.url.searchParams.get('id'),'eq.'+id(75));assert.equal(read.url.searchParams.get('business_id'),'eq.'+B);assert.equal(read.url.searchParams.get('branch_id'),'eq.'+BR);
  assert.equal(read.url.searchParams.get('limit'),'1');assert.equal(read.url.searchParams.get('offset'),'0');
  assert.match(read.url.searchParams.get('and'),/status\.not\.in\./);assert.match(read.url.searchParams.get('and'),/starts_at\.lt\.2030-01-15T20:00:00/);
  assert.equal(record.headers['cache-control'],'no-store');assert.equal(record.body.customers[0].id,C);
});

test('a direct ID does not bypass history filters or the selected branch',async t=>{
  apiFixture(t,{rows:[appointment(75,{status:'completed'}),appointment(76,{branch_id:OTHER_BR})]});
  assert.equal((await invoke(`business_id=${B}&branch_id=${BR}&scope=current&appointment_id=${id(75)}`)).statusCode,404);
  const history=await invoke(`business_id=${B}&branch_id=${BR}&scope=history&appointment_id=${id(75)}`);
  assert.equal(history.statusCode,200);assert.equal(history.body.appointment.status,'completed');
  assert.equal((await invoke(`business_id=${B}&branch_id=${BR}&scope=current&appointment_id=${id(76)}`)).statusCode,404);
});

test('unauthenticated, foreign-business and unassigned-branch direct reads fail closed',async t=>{
  const calls=apiFixture(t,{role:'employee'});
  assert.equal((await invoke(`business_id=${B}&appointment_id=${id(75)}`,{authorized:false})).statusCode,401);
  assert.equal((await invoke(`business_id=${OTHER_B}&appointment_id=${id(75)}`)).statusCode,403);
  assert.equal((await invoke(`business_id=${B}&branch_id=${OTHER_BR}&appointment_id=${id(75)}`)).statusCode,403);
  assert.equal((await invoke(`business_id=${B}&branch_id=all&appointment_id=${id(75)}`)).statusCode,403);
  assert.equal(calls.some(call=>call.url.pathname.endsWith('/dabbir_appointments')),false);
});

test('invalid, duplicate and paginated direct-record selectors cannot fall back to a list query',async t=>{
  const calls=apiFixture(t);
  for(const suffix of ['appointment_id=','appointment_id=not-a-uuid',`appointment_id=${id(1)}&appointment_id=${id(2)}`,`appointment_id=${id(1)}&offset=50`]){
    assert.equal((await invoke(`business_id=${B}&branch_id=${BR}&${suffix}`)).statusCode,400);
  }
  assert.equal(calls.some(call=>call.url.pathname.endsWith('/dabbir_appointments')),false);
});

test('direct-record upstream failure returns an error rather than an empty or successful appointment',async t=>{
  apiFixture(t,{failure:true});const res=await invoke(`business_id=${B}&branch_id=${BR}&appointment_id=${id(75)}`);
  assert.equal(res.statusCode,503);assert.equal(res.body.ok,false);assert.equal(res.body.appointment,undefined);
});

function readerFixture(t){
  const oldWindow=globalThis.window,events=[];
  globalThis.window={dispatchEvent:event=>events.push(event.type)};
  t.after(()=>{if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow});
  const life=createBookingLifecycle(),w={business:{id:B,timezone:'Asia/Dubai',country_code:'AE'},branch_scope:{mode:'selected',branch_id:BR},appointments:[]};
  life.setView(w,{view:'day',day:'2030-01-15',scope:'current',followToday:false});
  const reader=installBookingReader(life);
  return {life,w,reader,events};
}
const recordBody=(row=appointment(75),extra={})=>({ok:true,business_id:B,branch_id:BR,scope:'current',appointment:row,customers:[{id:C,display_name:'عميل الموعد'}],...extra});
const pageBody=(rows=[],customers=[])=>({ok:true,business_id:B,branch_id:BR,scope:'current',appointments:rows,customers,total:rows.length,has_more:false,next_offset:rows.length});

test('reader coalesces exact reads and caches the selected record without corrupting list pagination',async t=>{
  const {reader,w}=readerFixture(t),item=reader.entry(w);
  Object.assign(item,{ready:true,rows:Array.from({length:50},(_,n)=>appointment(n+1)),total:75,next_offset:50,has_more:true});
  const before=JSON.stringify(w);let finish,calls=0,requestUrl;
  t.mock.method(globalThis,'fetch',(url)=>{calls++;requestUrl=new URL(url,'https://fixture.invalid');return new Promise(resolve=>finish=resolve)});
  const first=reader.ensureRecord(w,id(75)),second=reader.ensureRecord(w,id(75));assert.equal(calls,1);
  finish(response(recordBody()));assert.equal((await first).id,id(75));await second;
  assert.equal(reader.find(w,id(75)).id,id(75));assert.equal(reader.customer(w,C).display_name,'عميل الموعد');
  assert.equal(item.rows.length,50);assert.equal(item.next_offset,50);assert.equal(item.total,75);assert.equal(item.has_more,true);
  assert.equal(JSON.stringify(w),before);
  assert.equal(requestUrl.searchParams.get('appointment_id'),id(75));assert.equal(requestUrl.searchParams.get('branch_id'),BR);assert.equal(requestUrl.searchParams.get('scope'),'current');
  assert.equal(requestUrl.searchParams.get('from'),'2030-01-15');assert.equal(requestUrl.searchParams.get('offset'),null);
});

test('reader propagates failures and rejects mismatched records without caching them',async t=>{
  const {reader,w}=readerFixture(t);let body=recordBody(appointment(75,{branch_id:OTHER_BR})),status=200;
  t.mock.method(globalThis,'fetch',async()=>response(body,status));
  await assert.rejects(reader.ensureRecord(w,id(75)),/BOOKING_CONTEXT_MISMATCH/);assert.equal(reader.find(w,id(75)),undefined);
  body={ok:false,error:'APPOINTMENT_NOT_FOUND'};status=404;
  await assert.rejects(reader.ensureRecord(w,id(75)),/APPOINTMENT_NOT_FOUND/);assert.equal(reader.find(w,id(75)),undefined);
  body=recordBody(appointment(75),{scope:'history'});status=200;
  await assert.rejects(reader.ensureRecord(w,id(75)),/BOOKING_CONTEXT_MISMATCH/);
  body=recordBody();assert.equal((await reader.ensureRecord(w,id(75))).id,id(75),'a safe retry must be possible after failures');
});

test('late direct-record replies cannot populate a different branch or lifecycle view',async t=>{
  const {reader,w,life}=readerFixture(t);let finish;
  t.mock.method(globalThis,'fetch',()=>new Promise(resolve=>finish=resolve));
  const request=reader.ensureRecord(w,id(75));w.branch_scope={mode:'selected',branch_id:OTHER_BR};
  finish(response(recordBody()));await assert.rejects(request,/BOOKING_CONTEXT_CHANGED/);assert.equal(reader.find(w,id(75)),undefined);
  w.branch_scope={mode:'selected',branch_id:BR};
  const next=reader.ensureRecord(w,id(75));life.setView(w,{scope:'history'});
  finish(response(recordBody()));await assert.rejects(next,/BOOKING_CONTEXT_CHANGED/);assert.equal(reader.find(w,id(75)),undefined);
});

test('invalidation permits a fresh read and prevents an older response replacing its result',async t=>{
  const {reader,w}=readerFixture(t),responses=[];
  t.mock.method(globalThis,'fetch',()=>new Promise(resolve=>responses.push(resolve)));
  const old=reader.ensureRecord(w,id(75));reader.invalidate(w);const fresh=reader.ensureRecord(w,id(75));assert.equal(responses.length,2);
  responses[1](response(recordBody(appointment(75,{status:'arrived'}))));await fresh;
  responses[0](response(recordBody()));await assert.rejects(old,/BOOKING_CONTEXT_CHANGED/);
  assert.equal(reader.find(w,id(75)).status,'arrived');
});

test('successful refresh replaces cached exact status and customer with the current collection',async t=>{
  const {reader,w}=readerFixture(t);let body=recordBody(appointment(75,{status:'requested'}));
  t.mock.method(globalThis,'fetch',async()=>response(body));
  await reader.ensureRecord(w,id(75));assert.equal(reader.find(w,id(75)).status,'requested');
  body=pageBody([appointment(75,{status:'confirmed'})],[{id:C,display_name:'اسم العميل المحدّث'}]);
  await reader.ensure(w,false,true);
  assert.equal(reader.entry(w).rows[0].status,'confirmed');
  assert.equal(reader.find(w,id(75)).status,'confirmed');
  assert.equal(reader.customer(w,C).display_name,'اسم العميل المحدّث');
  assert.equal(reader.entry(w).records.size,0);assert.equal(reader.entry(w).recordCustomers.size,0);
});

test('successful refresh cannot resurrect a removed or out-of-scope direct record from workspace data',async t=>{
  const {reader,w}=readerFixture(t);w.appointments=[appointment(75,{status:'requested'})];
  let body=recordBody(w.appointments[0]);t.mock.method(globalThis,'fetch',async()=>response(body));
  await reader.ensureRecord(w,id(75));body=pageBody();await reader.ensure(w,false,true);
  assert.equal(reader.find(w,id(75)),undefined);assert.equal(reader.customer(w,C),undefined);
  assert.equal(w.appointments[0].status,'requested','refresh must not mutate the workspace snapshot');
});

test('a successful newer refresh fences late exact responses and permits an immediate fresh exact read',async t=>{
  const {reader,w}=readerFixture(t),responses=[];
  t.mock.method(globalThis,'fetch',()=>new Promise(resolve=>responses.push(resolve)));
  const old=reader.ensureRecord(w,id(75));const rejected=assert.rejects(old,/BOOKING_CONTEXT_CHANGED/);
  const refresh=reader.ensure(w,false,true);
  responses[1](response(pageBody([appointment(75,{status:'confirmed'})],[{id:C,display_name:'اسم جديد'}])));await refresh;
  const fresh=reader.ensureRecord(w,id(75));assert.equal(responses.length,3,'refresh must detach the superseded request');
  responses[2](response(recordBody(appointment(75,{status:'arrived'}),{customers:[{id:C,display_name:'آخر اسم'}]})));await fresh;
  responses[0](response(recordBody(appointment(75,{status:'requested'}))));await rejected;
  assert.equal(reader.find(w,id(75)).status,'arrived');assert.equal(reader.customer(w,C).display_name,'آخر اسم');
});

test('pagination reconciles exact records it contains while preserving off-page records and offsets',async t=>{
  const {reader,w}=readerFixture(t);let body=recordBody(appointment(75,{status:'requested'}));
  t.mock.method(globalThis,'fetch',async()=>response(body));await reader.ensureRecord(w,id(75));
  body=recordBody(appointment(76,{status:'arrived'}));await reader.ensureRecord(w,id(76));
  Object.assign(reader.entry(w),{ready:true,rows:[appointment(1)],next_offset:50,total:76,has_more:true});
  body={...pageBody([appointment(75,{status:'confirmed'})],[{id:C,display_name:'اسم محدّث'}]),next_offset:76,total:76};
  await reader.ensure(w,true);
  assert.equal(reader.find(w,id(75)).status,'confirmed');assert.equal(reader.find(w,id(76)).status,'arrived');
  assert.equal(reader.customer(w,C).display_name,'اسم محدّث');assert.equal(reader.entry(w).next_offset,76);
  assert.deepEqual(reader.entry(w).rows.map(row=>row.id),[id(1),id(75)]);
});

test('failed refresh preserves the last verified direct data, exposes failure, and does not fence pending reads',async t=>{
  const {reader,w}=readerFixture(t);let body=recordBody(appointment(75,{status:'requested'})),httpStatus=200;
  t.mock.method(globalThis,'fetch',async()=>response(body,httpStatus));await reader.ensureRecord(w,id(75));
  body={ok:false,error:'BOOKING_READ_FAILED'};httpStatus=503;await reader.ensure(w,false,true);
  assert.equal(reader.find(w,id(75)).status,'requested');assert.equal(reader.customer(w,C).display_name,'عميل الموعد');
  assert.match(reader.status(w,true),/role="alert"/);
  const responses=[];globalThis.fetch=()=>new Promise(resolve=>responses.push(resolve));
  const exact=reader.ensureRecord(w,id(75)),refresh=reader.ensure(w,false,true);
  responses[1](response(body,503));await refresh;
  responses[0](response(recordBody(appointment(75,{status:'confirmed'}))));await exact;
  assert.equal(reader.find(w,id(75)).status,'confirmed');
});
