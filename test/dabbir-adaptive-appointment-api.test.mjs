import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import handler from '../api/adaptive-appointment.js';

const BIZ='11111111-1111-4111-8111-111111111111',USER='22222222-2222-4222-8222-222222222222';
const OTHER='33333333-3333-4333-8333-333333333333';
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const KEY='44444444-4444-4444-8444-444444444444';
const branch=(id,business_id=BIZ)=>({id,business_id,status:'active',is_primary:id===A});
const input=()=>({business_id:BIZ,branch_id:B,idempotency_key:KEY,customer_name:'Synthetic owner journey',starts_at:'2026-09-09T10:30:37.000Z',details:{duration:'45',status:'requested',notes:'Isolated test'}});
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});

// The real API and auth/branch helpers run against isolated HTTP responses backed
// by PostgreSQL uniqueness/FK/check constraints. No request can leave this fixture.
async function backend(options,run){
  const db=new PGlite();
  await db.exec(`
    create table dabbir_customers(id uuid primary key,business_id uuid not null,display_name text,lead_status text,metadata jsonb);
    create table dabbir_appointments(id uuid primary key,business_id uuid not null,branch_id uuid not null,
      customer_id uuid references dabbir_customers(id),starts_at timestamptz,ends_at timestamptz,status text,
      quoted_price_aed numeric,notes text,simulated boolean,idempotency_key text,idempotency_fingerprint text,
      check(idempotency_key is null or idempotency_key ~ '^[A-Za-z0-9:_-]{16,160}$'),
      check(idempotency_fingerprint is null or idempotency_fingerprint ~ '^[0-9a-f]{32}$'));
    create unique index dabbir_appointments_business_idempotency_uq on dabbir_appointments(business_id,idempotency_key) where idempotency_key is not null;
  `);
  const calls=[],originalFetch=globalThis.fetch;
  const state={userId:USER,role:'owner',branches:[branch(A),branch(B)],assignments:[],customerConflicts:0,appointmentConflicts:0,...options};
  let releaseCustomerReads,waitingReads=0;
  const customerBarrier=new Promise(resolve=>{releaseCustomerReads=resolve;});
  globalThis.fetch=async(url,opts={})=>{
    const target=new URL(String(url),'https://isolated.invalid'),method=opts.method||'GET';
    calls.push({path:target.pathname,query:target.search,method,body:opts.body?JSON.parse(opts.body):null});
    if(target.pathname==='/auth/v1/user')return response({id:state.userId});
    const table=target.pathname.replace('/rest/v1/','');
    if(table==='account_access_state')return response(state.suspended?[{status:'suspended'}]:[]);
    if(table==='dabbir_memberships')return response([{business_id:BIZ,role:state.role,status:'active',permissions:[]}]);
    if(table==='dabbir_business_branches'){
      assert.equal(target.searchParams.get('business_id'),'eq.'+BIZ);assert.equal(target.searchParams.get('status'),'eq.active');
      return response(state.branchPayload??state.branches);
    }
    if(table==='dabbir_membership_branches')return response(state.assignments);
    if(table==='dabbir_businesses')return response([{id:BIZ,business_type:'services',country_code:'AE',currency_code:'AED',timezone:'Asia/Dubai',phone_country_prefix:'+971'}]);
    assert.ok(['dabbir_customers','dabbir_appointments'].includes(table),'unexpected external request: '+target.pathname);
    if(method==='GET'){
      const business=target.searchParams.get('business_id')?.replace(/^eq\./,'');
      assert.equal(business,BIZ,'all replay/customer reads must be tenant-scoped');
      const column=table==='dabbir_appointments'?'idempotency_key':'id';
      const value=target.searchParams.get(column)?.replace(/^eq\./,'');
      const rows=(await db.query(`select * from ${table} where business_id=$1 and ${column}=$2`,[business,value])).rows;
      if(table==='dabbir_customers'&&state.race&&waitingReads<2){
        waitingReads++;if(waitingReads===2)releaseCustomerReads();await customerBarrier;
      }
      return response(rows);
    }
    assert.equal(method,'POST','no update, delete, or cleanup is permitted');
    if(table==='dabbir_appointments'&&state.rejectAppointment){state.rejectAppointment--;return response({code:'23514',message:'PRIVATE_CONSTRAINT_DETAIL'},409);}
    const row=JSON.parse(opts.body);if(table==='dabbir_appointments')row.id=randomUUID();
    let saved;
    try{saved=(await db.query(`insert into ${table} select * from jsonb_populate_record(null::${table},$1::jsonb) returning *`,[JSON.stringify(row)])).rows[0];}
    catch(error){
      if(error.code==='23505'){if(table==='dabbir_customers')state.customerConflicts++;else state.appointmentConflicts++;}
      return response({code:error.code,message:'PRIVATE_DATABASE_DETAIL'},409);
    }
    const lossFlag=table==='dabbir_customers'?'loseCustomerResponse':'loseAppointmentResponse';
    if(state[lossFlag]){state[lossFlag]--;throw new TypeError('PRIVATE_NETWORK_DETAIL');}
    if(table==='dabbir_appointments'&&state.wrongSavedBranch)saved.branch_id=A;
    return response([saved]);
  };
  const request=async(body=input(),headers={})=>{
    const req=Readable.from([Buffer.from(JSON.stringify(body))]);req.method='POST';
    req.headers={host:'isolated.invalid','x-dabbir-client':'web',cookie:'__Host-dabbir_access=fixture-token',...headers};
    let result;const res={statusCode:0,setHeader(){},end(value){result=JSON.parse(value);}};
    await handler(req,res);return {status:res.statusCode,body:result};
  };
  const count=async table=>Number((await db.query(`select count(*) as n from ${table}`)).rows[0].n);
  try{await run({db,state,calls,request,count});}
  finally{globalThis.fetch=originalFetch;await db.close();}
}

test('selected non-primary branch is verified before writes and persists with exact time',()=>backend({},async b=>{
  const r=await b.request();assert.equal(r.status,200);assert.equal(r.body.ok,true);assert.equal(r.body.branch_id,B);
  assert.equal(r.body.appointment.branch_id,B);assert.equal(r.body.idempotent_replay,false);
  assert.equal(new Date(r.body.appointment.starts_at).toISOString(),'2026-09-09T10:30:37.000Z');
  assert.equal(new Date(r.body.appointment.ends_at)-new Date(r.body.appointment.starts_at),45*60000);
  assert.equal(r.body.appointment.idempotency_fingerprint,undefined);
  const firstWrite=b.calls.findIndex(call=>call.method==='POST');
  assert.ok(b.calls.findIndex(call=>call.path.endsWith('/dabbir_business_branches'))<firstWrite);
  assert.equal(await b.count('dabbir_customers'),1);assert.equal(await b.count('dabbir_appointments'),1);
}));

test('unassigned, foreign, invalid, and ambiguous branches are denied before any write',()=>backend({role:'employee',assignments:[{business_id:BIZ,user_id:USER,branch_id:A}]},async b=>{
  const cases=[
    [input(),403,'BRANCH_ACCESS_DENIED'],
    [{...input(),branch_id:OTHER},404,'BRANCH_NOT_FOUND'],
    [{...input(),branch_id:'bad-branch'},400,'INVALID_BRANCH_ID'],
    [{...input(),branch_id:'all'},403,'ALL_BRANCHES_ACCESS_DENIED'],
    [{...input(),business_id:OTHER},403,'BUSINESS_ACCESS_DENIED'],
  ];
  for(const [body,status,error] of cases){const r=await b.request(body);assert.equal(r.status,status);assert.equal(r.body.error,error);assert.match(r.body.message_ar,/[\u0600-\u06ff]/);}
  assert.equal(b.calls.some(call=>call.method==='POST'),false);
}));

test('all-branch owner must choose when multiple branches exist, but a sole branch is automatic',()=>backend({},async b=>{
  const body={...input(),branch_id:'all'};let r=await b.request(body);
  assert.equal(r.status,409);assert.equal(r.body.error,'SELECTED_BRANCH_REQUIRED');assert.equal(b.calls.some(call=>call.method==='POST'),false);
  b.state.branches=[branch(B)];r=await b.request(body);assert.equal(r.status,200);assert.equal(r.body.branch_id,B);
}));

test('unavailable branch data and suspended accounts fail before writes',()=>backend({branchPayload:{error:'PRIVATE_BRANCH_DETAIL'}},async b=>{
  let r=await b.request();assert.equal(r.status,502);assert.equal(r.body.error,'BRANCH_LOOKUP_FAILED');
  assert.doesNotMatch(JSON.stringify(r.body),/PRIVATE_BRANCH/);assert.equal(b.calls.some(call=>call.method==='POST'),false);
  b.state.suspended=true;r=await b.request();assert.equal(r.status,401);assert.equal(r.body.error,'AUTH_REQUIRED');
}));

test('Safari web-client header is accepted while explicit cross-origin requests are rejected',()=>backend({},async b=>{
  let r=await b.request(input(),{origin:'https://cross-origin.invalid'});assert.equal(r.status,403);assert.equal(r.body.error,'ORIGIN_REQUIRED');assert.equal(b.calls.length,0);
  r=await b.request(input(),{'x-dabbir-client':undefined});assert.equal(r.status,403);assert.equal(b.calls.length,0);
  r=await b.request();assert.equal(r.status,200);
}));

test('invalid request keys cannot create customers',()=>backend({},async b=>{
  for(const idempotency_key of [undefined,'short','../unsafe']){const r=await b.request({...input(),idempotency_key});assert.equal(r.status,400);assert.equal(r.body.error,'VALID_IDEMPOTENCY_KEY_REQUIRED');}
  assert.equal(b.calls.some(call=>call.method==='POST'),false);
}));

test('lost appointment response replays the same booking and customer before any further write',()=>backend({loseAppointmentResponse:1},async b=>{
  let r=await b.request();assert.equal(r.status,502);assert.equal(r.body.error,'APPOINTMENT_CREATE_UNVERIFIED');
  assert.doesNotMatch(JSON.stringify(r.body),/PRIVATE_NETWORK/);
  const saved=(await b.db.query('select * from dabbir_appointments')).rows[0];const before=b.calls.length;
  r=await b.request();assert.equal(r.status,200);assert.equal(r.body.idempotent_replay,true);
  assert.equal(r.body.appointment.id,saved.id);assert.equal(r.body.appointment.customer_id,saved.customer_id);
  assert.equal(b.calls.slice(before).some(call=>call.method==='POST'),false);
  assert.equal(await b.count('dabbir_customers'),1);assert.equal(await b.count('dabbir_appointments'),1);
}));

test('lost customer response reuses its deterministic UUID without another customer write',()=>backend({loseCustomerResponse:1},async b=>{
  let r=await b.request();assert.equal(r.status,502);assert.equal(r.body.error,'CUSTOMER_CREATE_UNVERIFIED');
  assert.equal(await b.count('dabbir_customers'),1);assert.equal(await b.count('dabbir_appointments'),0);
  const customer=(await b.db.query('select * from dabbir_customers')).rows[0];const before=b.calls.length;
  r=await b.request();assert.equal(r.status,200);assert.equal(r.body.appointment.customer_id,customer.id);
  assert.equal(b.calls.slice(before).some(call=>call.path.endsWith('/dabbir_customers')&&call.method==='POST'),false);
  assert.equal(await b.count('dabbir_customers'),1);
}));

test('same key with changed actor, branch, or normalized input never writes a second booking',()=>backend({},async b=>{
  const first=await b.request();assert.equal(first.status,200);const before=b.calls.length;
  for(const body of [{...input(),branch_id:A},{...input(),customer_name:'Different synthetic name'},{...input(),details:{...input().details,duration:60}}]){
    const r=await b.request(body);assert.equal(r.status,409);assert.equal(r.body.error,'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_BOOKING');
  }
  b.state.userId=OTHER;const r=await b.request();assert.equal(r.status,409);assert.equal(r.body.error,'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_BOOKING');
  assert.equal(b.calls.slice(before).some(call=>call.method==='POST'),false);
}));

test('concurrent requests resolve PostgreSQL customer and appointment unique conflicts to one result',()=>backend({race:true},async b=>{
  const [first,second]=await Promise.all([b.request(),b.request()]);
  assert.equal(first.status,200);assert.equal(second.status,200);
  assert.equal(first.body.appointment.id,second.body.appointment.id);assert.equal(first.body.appointment.customer_id,second.body.appointment.customer_id);
  assert.equal(b.state.customerConflicts,1);assert.equal(b.state.appointmentConflicts,1);
  assert.equal([first,second].filter(r=>r.body.idempotent_replay).length,1);
  assert.equal(await b.count('dabbir_customers'),1);assert.equal(await b.count('dabbir_appointments'),1);
}));

test('a rejected booking can leave one customer, and retry reuses it without cleanup',()=>backend({rejectAppointment:1},async b=>{
  let r=await b.request();assert.equal(r.status,409);assert.equal(r.body.error,'APPOINTMENT_CREATE_FAILED');assert.doesNotMatch(JSON.stringify(r.body),/PRIVATE_CONSTRAINT/);
  assert.equal(await b.count('dabbir_customers'),1);assert.equal(await b.count('dabbir_appointments'),0);
  r=await b.request();assert.equal(r.status,200);assert.equal(await b.count('dabbir_customers'),1);assert.equal(await b.count('dabbir_appointments'),1);
  assert.ok(b.calls.every(call=>['GET','POST'].includes(call.method)));
}));

test('customer marker mismatch fails closed without mutating an existing customer',()=>backend({rejectAppointment:1},async b=>{
  await b.request();await b.db.query("update dabbir_customers set metadata='{}'::jsonb");const before=b.calls.length;
  const r=await b.request();assert.equal(r.status,409);assert.equal(r.body.error,'CUSTOMER_IDEMPOTENCY_CONFLICT');
  assert.equal(b.calls.slice(before).some(call=>call.method==='POST'),false);assert.equal(await b.count('dabbir_appointments'),0);
}));

test('selecting a saved customer never inserts or updates customer data',()=>backend({},async b=>{
  const customerId=randomUUID();await b.db.query('insert into dabbir_customers(id,business_id,display_name) values($1,$2,$3)',[customerId,BIZ,'Existing synthetic customer']);
  const r=await b.request({...input(),details:{...input().details,customer_id:customerId}});
  assert.equal(r.status,200);assert.equal(r.body.customer_reused,true);assert.equal(r.body.appointment.customer_id,customerId);
  assert.equal(b.calls.some(call=>call.path.endsWith('/dabbir_customers')&&call.method!=='GET'),false);
}));

test('wrong-branch write representation is never announced as a verified success',()=>backend({wrongSavedBranch:true},async b=>{
  const r=await b.request();assert.equal(r.status,502);assert.equal(r.body.error,'APPOINTMENT_BRANCH_UNVERIFIED');
}));
