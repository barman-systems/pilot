import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {Readable} from 'node:stream';
import ownerHandler from '../api/ai-business-operator.js';
const db=new PGlite(),sql=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const B='11111111-1111-4111-8111-111111111111',O='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333',R='44444444-4444-4444-8444-444444444444',S='55555555-5555-4555-8555-555555555555',X='66666666-6666-4666-8666-666666666666',W='77777777-7777-4777-8777-777777777777',V='88888888-8888-4888-8888-888888888888';
const request=()=>({branch_id:R,customer_id:C,service_id:S,delivery_mode:'AT_BUSINESS',local_start:new Date(Date.now()+3*86400000).toISOString().slice(0,10)+'T12:30:37',facts:{}});
const call=async(r=request(),execute=false,hash=null,key='owner-ai:isolated-request-0001')=>(await db.query('select public.dabbir_owner_activity_booking_v1($1,$2,$3,$4,$5) result',[B,r,execute,hash,key])).rows[0].result;
const count=async()=>Number((await db.query('select count(*) n from dabbir_appointments')).rows[0].n);
async function reset(){await db.exec('reset role;delete from dabbir_appointment_services;delete from dabbir_appointments;delete from dabbir_activity_service_versions;delete from dabbir_whatsapp_location_receipts;delete from dabbir_worker_services;delete from dabbir_worker_branches;delete from dabbir_calendar_busy_blocks;delete from dabbir_business_knowledge;');await db.query('update dabbir_private.activity_registry_v1 set schema=$1',[JSON.parse(sql('../api/_dabbir-activity-registry.json'))]);await db.query("update dabbir_services set price_aed=70,duration_minutes=45 where id=$1",[S]);await db.query("update dabbir_businesses set business_type='services' where id=$1",[B]);await db.query("select set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claim.sub',$1,false),set_config('test.account_active','true',false)",[O]);await db.exec('set role authenticated');}
before(async()=>{
 await db.exec(sql('./fixtures/understanding/database.sql'));
 await db.exec(sql('../supabase/migrations/20260908025920_dabbir_understanding_engine_v2.sql'));
 await db.exec(sql('./fixtures/understanding/activity-database.sql'));
 for(const name of ['20260908155841_dabbir_activity_intelligence_v1.sql','20260909085635_dabbir_activity_action_authority_v1.sql','20260909091257_dabbir_activity_configuration_visibility_v1.sql'])await db.exec(sql('../supabase/migrations/'+name));
 await db.exec(`alter table dabbir_businesses add column currency_code text default 'AED';alter table dabbir_customers add column display_name text default 'Isolated Customer';
 alter table dabbir_worker_services add column duration_minutes integer,add column price_aed numeric;
 alter table dabbir_appointments add column ends_at timestamptz,add column quoted_price_aed numeric,add column discount_aed numeric,add column payment_status text,add column idempotency_key text,add column idempotency_fingerprint text;
 create unique index owner_booking_replay on dabbir_appointments(business_id,idempotency_key) where idempotency_key is not null;
 create table dabbir_appointment_services(business_id uuid,appointment_id uuid references dabbir_appointments(id),service_id uuid,worker_id uuid,service_name_ar text,service_name_en text,duration_minutes integer,unit_price_aed numeric,discount_aed numeric);
 create table dabbir_calendar_busy_blocks(business_id uuid,starts_at timestamptz,ends_at timestamptz);
 create table dabbir_worker_schedules(business_id uuid,worker_id uuid,weekday smallint,active boolean,schedule_type text,starts_at time,ends_at time);
 create table dabbir_worker_time_off(business_id uuid,worker_id uuid,starts_at timestamptz,ends_at timestamptz);
 grant select on dabbir_appointments,dabbir_appointment_services to authenticated;
 create function dabbir_private.is_active_member(b uuid) returns boolean language sql as $$select current_setting('test.account_active',true)='true' and exists(select 1 from public.dabbir_memberships where business_id=b and user_id=auth.uid() and status='active')$$;
 `);
 await db.exec(sql('./fixtures/understanding/owner-booking-slot-authority.sql'));
 await db.exec(sql('../supabase/migrations/20260909102912_dabbir_owner_activity_booking_adapter_v1.sql'));
 await db.query('insert into auth.users(id) values($1),($2)',[O,X]);
 await db.query('insert into dabbir_businesses(id) values($1),($2)',[B,X]);
 await db.query("insert into dabbir_memberships values($1,$2,'owner','active'),($1,$3,'employee','active')",[B,O,X]);
 await db.query('insert into dabbir_customers(id,business_id)values($1,$2),($3,$3)',[C,B,X]);
 await db.query('insert into dabbir_business_branches(id,business_id)values($1,$2),($3,$3)',[R,B,X]);
 await db.query('insert into dabbir_services(id,business_id)values($1,$2),($3,$3)',[S,B,X]);
 await db.query('insert into dabbir_branch_services(business_id,branch_id,service_id)values($1,$2,$3)',[B,R,S]);
 await db.query('insert into dabbir_workers(id,business_id)values($1,$2)',[W,B]);
 await db.query('insert into dabbir_conversations(id,business_id,customer_id,branch_id)values($1,$2,$3,$4)',[V,B,C,R]);
});after(()=>db.close());

test('owner quote creates nothing; approval persists actual service terms and replays one appointment',async()=>{
 await reset();const r=request(),q=await call(r);assert.equal(await count(),0);assert.equal(q.quote.price,70);assert.equal(q.quote.duration_minutes,45);
 const result=await call(r,true,q.quote_hash);assert.equal(result.verified,true);assert.equal(result.activity_intelligence.activity_type,'services');assert.equal(result.activity_intelligence.source,'owner_ai');
 assert.equal(new Date(result.starts_at).toISOString().slice(11),'08:30:37.000Z');assert.equal(new Date(result.ends_at)-new Date(result.starts_at),45*60000);
 const replay=await call(r,true,q.quote_hash);assert.equal(replay.appointment_id,result.appointment_id);assert.equal(replay.idempotent_replay,true);assert.equal(await count(),1);
 assert.equal((await db.query('select duration_minutes,unit_price_aed from dabbir_appointment_services')).rows[0].unit_price_aed,'70');
});
test('cross-tenant customer, service and branch cannot prepare or execute',async()=>{await reset();for(const key of ['customer_id','service_id','branch_id'])await assert.rejects(call({...request(),[key]:X}),/ACTIVITY_.*SCOPE_INVALID/);assert.equal(await count(),0);});
test('employee, suspended owner, anonymous and service-role callers fail closed',async()=>{
 await reset();await db.query("select set_config('request.jwt.claim.sub',$1,false)",[X]);await assert.rejects(call(),/OWNER_REQUIRED/);
 await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('test.account_active','false',false)",[O]);await assert.rejects(call(),/OWNER_REQUIRED/);
 await db.exec('reset role;set role anon');await assert.rejects(call(),/permission denied/);await db.exec('reset role');await db.query("select set_config('request.jwt.claim.role','service_role',false),set_config('test.account_active','true',false)");await assert.rejects(call(),/OWNER_REQUIRED/);assert.equal(await count(),0);
});
test('changed price, missing execution mode and tampered quote cannot mutate',async()=>{
 await reset();const r=request(),q=await call(r);await db.exec('reset role');await db.query('update dabbir_services set price_aed=80 where id=$1',[S]);await db.exec('set role authenticated');await assert.rejects(call(r,true,q.quote_hash),/OWNER_BOOKING_QUOTE_STALE/);await assert.rejects(call(r,null,q.quote_hash),/OWNER_BOOKING_EXECUTION_MODE_REQUIRED/);await assert.rejects(call(r,true,'forged'),/OWNER_BOOKING_QUOTE_STALE/);assert.equal(await count(),0);
});
test('same request key with changed booking is rejected; occupied slot is unavailable',async()=>{
 await reset();const r=request(),q=await call(r);await call(r,true,q.quote_hash);await assert.rejects(call({...r,local_start:r.local_start.replace('12:30','14:00')},true,q.quote_hash),/IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_BOOKING/);await assert.rejects(call(r),/ACTION_SLOT_UNAVAILABLE/);assert.equal(await count(),1);
});
test('owner approval policy authorizes only owner adapter; WhatsApp invariant stays closed',async()=>{
 await reset();await db.exec('reset role');await db.query("insert into dabbir_activity_service_versions(business_id,branch_id,service_id,version,action,config,created_by)values($1,$2,$3,1,'SAVE',$4,$5)",[B,R,S,{owner_approval:true,automatic_booking:false},O]);await db.exec('set role authenticated');const q=await call();assert.equal(q.state,'awaiting_approval');await call(request(),true,q.quote_hash);
 await db.exec('reset role');const c=(await db.query('select dabbir_private.activity_contract_v1($1,$2,$3) c',[B,R,S])).rows[0].c;
 const state={scope:{business_id:B,branch_id:R,customer_id:C,conversation_id:V},pending_action:'CREATE_BOOKING',activity_contract_version:c.contract_version};
 await assert.rejects(db.query('select dabbir_private.activity_assert_state_v1($1,$2,$3,$4,$5,$6)',[B,R,C,V,state,S]),/ACTIVITY_OWNER_APPROVAL_REQUIRED/);
});
test('mobile activity requires vehicle and genuine scoped location receipt',async()=>{
 await reset();await db.exec('reset role');await db.query("update dabbir_businesses set business_type='car_wash' where id=$1",[B]);await db.exec('set role authenticated');const r={...request(),delivery_mode:'MOBILE',facts:{vehicle:'saloon'}};
 await assert.rejects(call(r),/ACTIVITY_LOCATION_RECEIPT_UNVERIFIED/);
 await db.exec('reset role');await db.query('insert into dabbir_messages(id,business_id,conversation_id)values($1,$2,$3)',[W,B,V]);await db.query('insert into dabbir_whatsapp_location_receipts(message_id,business_id,conversation_id,latitude,longitude)values($1,$2,$3,24.4,54.4)',[W,B,V]);await db.exec('set role authenticated');r.location_receipt_id=W;
 await assert.rejects(call({...r,facts:{vehicle:'fabricated'}}),/ACTIVITY_VEHICLE_INVALID/);const q=await call(r);const result=await call(r,true,q.quote_hash);assert.equal(result.activity_intelligence.delivery_mode,'MOBILE');assert.equal(result.activity_intelligence.location_receipt_id,W);
});
test('service override requires qualified staff and uses the staff price and duration',async()=>{
 await reset();await db.exec('reset role');
 await db.query("insert into dabbir_activity_service_versions(business_id,branch_id,service_id,version,action,config,created_by)values($1,$2,$3,1,'SAVE',$4,$5)",[B,R,S,{required_entities:['worker','date','time']},O]);
 await db.exec('set role authenticated');await assert.rejects(call(),/ACTIVITY_REQUIRED_FACT_UNVERIFIED:worker/);await assert.rejects(call({...request(),worker_id:W}),/ACTIVITY_WORKER_SCOPE_INVALID/);
 await db.exec('reset role');await db.query('insert into dabbir_worker_branches(business_id,branch_id,worker_id)values($1,$2,$3)',[B,R,W]);await db.query('insert into dabbir_worker_services(business_id,service_id,worker_id,duration_minutes,price_aed)values($1,$2,$3,60,95)',[B,S,W]);await db.exec('set role authenticated');
 const r={...request(),worker_id:W},q=await call(r);assert.equal(q.quote.duration_minutes,60);assert.equal(q.quote.price,95);const a=await call(r,true,q.quote_hash);assert.equal(a.worker_id,W);assert.equal(a.price,95);
});
test('location picker rejects foreign scope and employee access without granting receipt table access',async()=>{
 await reset();const locations=(branch,customer)=>db.query('select public.dabbir_owner_booking_locations_v1($1,$2,$3) result',[B,branch,customer]);
 assert.deepEqual((await locations(R,C)).rows[0].result,[]);await assert.rejects(locations(X,C),/ACTIVITY_BRANCH_SCOPE_INVALID/);await assert.rejects(locations(R,X),/ACTIVITY_CUSTOMER_SCOPE_INVALID/);await assert.rejects(db.query('select * from dabbir_whatsapp_location_receipts'),/permission denied/);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[X]);await assert.rejects(locations(R,C),/OWNER_REQUIRED/);
});
test('owner rule restricting CREATE_BOOKING is enforced and provider calendar blocks are honored',async()=>{
 await reset();await db.exec('reset role');await db.query("insert into dabbir_calendar_busy_blocks values($1,($2::timestamp at time zone 'Asia/Dubai'),($2::timestamp at time zone 'Asia/Dubai')+interval '2 hours')",[B,request().local_start]);await db.exec('set role authenticated');await assert.rejects(call(),/ACTION_SLOT_UNAVAILABLE/);
 await db.exec('reset role');await db.exec("update dabbir_private.activity_registry_v1 set schema=jsonb_set(schema,'{activities,services,supported_actions}','[\"PRICING\"]')");await db.exec('set role authenticated');await assert.rejects(call(),/ACTIVITY_ACTION_NOT_SUPPORTED/);assert.equal(await count(),0);
});


test('owner API signs the database quote, rejects tampering, executes through RPC and verifies replay',async()=>{
 await reset();const original=globalThis.fetch;let writes=0;
 globalThis.fetch=async(url,options={})=>{
  const target=new URL(String(url),'https://isolated.invalid');const path=target.pathname;
  const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
  if(path==='/auth/v1/user')return respond({id:O});
  if(path==='/rest/v1/account_access_state')return respond([]);
  if(path==='/rest/v1/dabbir_memberships')return respond([{business_id:B,user_id:O,role:'owner',status:'active',permissions:[]}]);
  assert.equal(path,'/rest/v1/rpc/dabbir_owner_activity_booking_v1');
  const p=JSON.parse(options.body);assert.equal(p.p_business_id,B);if(p.p_execute)writes++;
  try{return respond(await call(p.p_request,p.p_execute,p.p_quote_hash,p.p_operation_key));}catch(error){return respond({message:error.message},409);}
 };
 const invoke=async(body)=>{
  const req=Readable.from([Buffer.from(JSON.stringify({business_id:B,language:'ar',...body}))]);req.method='POST';req.headers={host:'isolated.invalid','x-dabbir-client':'web',cookie:'__Host-dabbir_access=fixture-token'};
  let result;const res={setHeader(){},end(value){result=JSON.parse(value);}};await ownerHandler(req,res);return {status:res.statusCode,body:result};
 };
 try{
  const prepared=await invoke({action:'booking_quote',booking:request()});assert.equal(prepared.status,200,JSON.stringify(prepared.body));assert.equal(prepared.body.state,'awaiting_approval');assert.equal(prepared.body.booking_quote.service_id,S);assert.equal(writes,0);assert.equal(await count(),0);
  const token=prepared.body.approval_token;
  const tampered=await invoke({action:'approve',approval_token:'X'+token.slice(1)});assert.equal(tampered.status,403);assert.equal(writes,0);
  const executed=await invoke({action:'approve',approval_token:token});assert.equal(executed.status,200);assert.equal(executed.body.state,'completed');assert.equal(executed.body.receipts[0].result.service_id,S);assert.equal(await count(),1);
  const repeated=await invoke({action:'approve',approval_token:token});assert.equal(repeated.body.receipts[0].result.idempotent_replay,true);assert.equal(await count(),1);
 }finally{globalThis.fetch=original;}
});
