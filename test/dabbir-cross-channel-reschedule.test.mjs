import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

process.env.SUPABASE_URL='https://reschedule-fixture.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-calendar-service-key-for-tests';
process.env.DABBIR_CALENDAR_TOKEN_KEY='synthetic-calendar-encryption-key-for-tests';
process.env.DABBIR_GOOGLE_CALENDAR_CLIENT_ID='synthetic-client';
process.env.DABBIR_GOOGLE_CALENDAR_CLIENT_SECRET='synthetic-secret';
process.env.DABBIR_MICROSOFT_CALENDAR_CLIENT_ID='synthetic-client';
process.env.DABBIR_MICROSOFT_CALENDAR_CLIENT_SECRET='synthetic-secret';
const {encryptTokenPayload}=await import('../api/_calendar-core.js');
const {syncCalendarConnection}=await import('../api/_calendar-sync-core.js');
const B='10000000-0000-4000-8000-000000000001',A='20000000-0000-4000-8000-000000000001',C='30000000-0000-4000-8000-000000000001';
const day=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
const oldStart=day+'T09:00:00.000Z',oldEnd=day+'T10:30:00.000Z';
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});

function fixture(t,provider,newStart,{rejectDatabase=false,writeAppointment}={}){
  const calls=[],appointment={id:A,customer_id:C,starts_at:oldStart,ends_at:oldEnd,status:'confirmed'};
  const expectedEnd=new Date(new Date(newStart).getTime()+90*60000).toISOString();
  const event=provider==='google'?{id:'synthetic-event',status:'confirmed',start:{dateTime:newStart},end:{dateTime:expectedEnd}}:{id:'synthetic-event',isCancelled:false,start:{dateTime:newStart},end:{dateTime:expectedEnd}};
  const sealed=encryptTokenPayload({access_token:'synthetic-provider-token'});
  const credential={token_ciphertext:sealed.ciphertext,token_iv:sealed.iv,token_tag:sealed.tag,token_expires_at:new Date(Date.now()+3600000).toISOString()};
  t.mock.method(globalThis,'fetch',async(input,options={})=>{
    const url=new URL(input),method=options.method||'GET',body=options.body?JSON.parse(options.body):null;
    calls.push({url,method,body});
    if(url.origin==='https://reschedule-fixture.invalid'){
      const table=url.pathname.split('/').at(-1);
      if(method==='GET'&&table==='dabbir_calendar_credentials')return response([credential]);
      if(method==='GET'&&table==='dabbir_appointments')return response([{...appointment}]);
      if(method==='GET'&&table==='dabbir_customers')return response([{id:C,display_name:'Synthetic customer'}]);
      if(method==='GET'&&table==='dabbir_calendar_event_links')return response([{connection_id:C,appointment_id:A,provider_event_id:event.id,sync_hash:'previous-snapshot'}]);
      if(method==='PATCH'&&table==='dabbir_appointments'){
        assert.equal(url.searchParams.get('business_id'),'eq.'+B);
        assert.equal(url.searchParams.get('id'),'eq.'+A);
        if(rejectDatabase)return response({message:'APPOINTMENT_TIME_CONFLICT'},409);
        if(writeAppointment){try{await writeAppointment(body)}catch(error){return response({message:error.message},409)}}
        Object.assign(appointment,body);return response(null);
      }
      if(['POST','PATCH','DELETE'].includes(method)&&['dabbir_calendar_event_links','dabbir_calendar_busy_blocks','dabbir_calendar_connections'].includes(table))return response(null);
    }
    if(['https://www.googleapis.com','https://graph.microsoft.com'].includes(url.origin)){
      if(method==='GET')return response(provider==='google'?{items:[event]}:{value:[event]});
      if(method==='PATCH')return response({...event,...body});
    }
    throw new Error('UNEXPECTED_FIXTURE_REQUEST '+method+' '+url.pathname);
  });
  return {calls,appointment,expectedEnd,run:()=>syncCalendarConnection({headers:{host:'reschedule-fixture.invalid'}},{id:C,business_id:B,provider})};
}

for(const provider of ['google','outlook'])for(const hour of ['06','12']){
  test(`${provider} reschedule ${hour}:00 preserves the persisted 90-minute booking interval`,async t=>{
    const next=day+`T${hour}:00:00.000Z`,f=fixture(t,provider,next);
    const result=await f.run();
    assert.equal(result.provider_updates,1);
    const write=f.calls.find(c=>c.method==='PATCH'&&c.url.pathname.endsWith('/dabbir_appointments'));
    assert.deepEqual(write.body,{starts_at:next,ends_at:f.expectedEnd,status:'rescheduled'});
    assert.equal(f.appointment.ends_at,f.expectedEnd);
    const outbound=f.calls.find(c=>c.method==='PATCH'&&['www.googleapis.com','graph.microsoft.com'].includes(c.url.hostname));
    const outboundEnd=outbound.body.end.dateTime;
    if(provider==='outlook')assert.equal(outbound.body.end.timeZone,'UTC');
    assert.equal(new Date(provider==='outlook'&&!outboundEnd.endsWith('Z')?outboundEnd+'Z':outboundEnd).getTime(),new Date(f.expectedEnd).getTime());
    assert.equal(new Date(f.appointment.ends_at)-new Date(f.appointment.starts_at),90*60000);
  });
}
for(const provider of ['google','outlook'])test(`${provider} database rejection does not report a reschedule or send provider updates`,async t=>{
  const f=fixture(t,provider,day+'T12:00:00.000Z',{rejectDatabase:true});
  await assert.rejects(f.run(),error=>error.code===409&&error.detail==='APPOINTMENT_TIME_CONFLICT');
  assert.equal(f.appointment.starts_at,oldStart);
  assert.equal(f.appointment.ends_at,oldEnd);
  assert.equal(f.calls.some(c=>c.method!=='GET'&&['www.googleapis.com','graph.microsoft.com'].includes(c.url.hostname)),false);
});

for(const provider of ['google','outlook'])test(`${provider} reschedule passes the actual PostgreSQL range trigger without weakening it`,async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(readFileSync(new URL('./fixtures/architecture/reschedule-calendar-postgres.sql',import.meta.url),'utf8'));
  await db.query('insert into dabbir_businesses values($1,$2)',[B,'Asia/Dubai']);
  await db.query('insert into dabbir_appointments(id,business_id,starts_at,ends_at,status) values($1,$2,$3,$4,$5)',[A,B,oldStart,oldEnd,'confirmed']);
  const next=day+'T12:00:00.000Z';
  const f=fixture(t,provider,next,{writeAppointment:async body=>{
    const fields=Object.keys(body);assert.ok(fields.every(key=>['starts_at','ends_at','status'].includes(key)));
    await db.query('update dabbir_appointments set '+fields.map((key,i)=>key+'=$'+(i+1)).join(',')+' where id=$'+(fields.length+1)+' and business_id=$'+(fields.length+2),[...fields.map(key=>body[key]),A,B]);
  }});
  assert.equal((await f.run()).provider_updates,1);
  const row=(await db.query('select starts_at,ends_at,status from dabbir_appointments where id=$1',[A])).rows[0];
  assert.equal(new Date(row.starts_at).toISOString(),next);
  assert.equal(new Date(row.ends_at).toISOString(),f.expectedEnd);
  assert.equal(row.status,'rescheduled');
  // The same unchanged database authority still rejects a conflicting range.
  await db.query('insert into dabbir_calendar_busy_blocks values($1,$2,$3)',[B,day+'T15:00:00Z',day+'T17:00:00Z']);
  await assert.rejects(db.query('update dabbir_appointments set starts_at=$1,ends_at=$2 where id=$3',[day+'T15:30:00Z',day+'T17:00:00Z',A]),/APPOINTMENT_CALENDAR_CONFLICT/);
});
