import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL='https://owner-priorities-fixture.invalid';
process.env.SUPABASE_AUTH_URL=process.env.SUPABASE_URL;
process.env.SUPABASE_DATA_URL=process.env.SUPABASE_URL;
const {default:handler}=await import('../api/owner-action-center.js');
const BUSINESS='10000000-0000-4000-8000-000000000001';
const OTHER='10000000-0000-4000-8000-000000000002';
const USER='40000000-0000-4000-8000-000000000001';
const NOW=Date.parse('2026-09-08T08:00:00.000Z');
const iso=delta=>new Date(NOW+delta).toISOString();
const response=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});

// A small read-only PostgREST fixture applies the actual query before its LIMIT.
// This lets historical records compete with live work, as they do in production.
function matches(value,expression){
  if(expression==='not.is.true')return value!==true;
  if(expression.startsWith('not.in.('))return value!=null&&!expression.slice(8,-1).split(',').includes(String(value));
  if(expression.startsWith('in.('))return expression.slice(4,-1).split(',').includes(String(value));
  const dot=expression.indexOf('.'),op=expression.slice(0,dot),expected=expression.slice(dot+1);
  if(op==='eq')return String(value)===expected;
  if(op==='gte')return value!=null&&String(value)>=expected;
  if(op==='lte')return value!=null&&String(value)<=expected;
  throw new Error('Unsupported fixture filter: '+expression);
}
function queryRows(rows,url){
  let result=rows.slice();
  for(const [key,expression] of url.searchParams){
    if(['select','order','limit'].includes(key))continue;
    result=result.filter(row=>matches(row[key],expression));
  }
  const order=String(url.searchParams.get('order')||'').split(',').filter(Boolean);
  result.sort((a,b)=>{
    for(const part of order){const [key,direction]=part.split('.'),diff=String(a[key]??'').localeCompare(String(b[key]??''));if(diff)return direction==='desc'?-diff:diff}
    return 0;
  });
  return result.slice(0,Number(url.searchParams.get('limit')||result.length));
}
function fixture(t,{tables={},failure,malformed,outcomesCountMissing=false}={}){
  const calls=[];
  t.mock.method(Date,'now',()=>NOW);
  t.mock.method(globalThis,'fetch',async(input,options={})=>{
    const url=new URL(input),table=url.pathname.split('/').at(-1);
    calls.push({url,options});
    if(url.pathname==='/auth/v1/user')return response({id:USER});
    if(table==='dabbir_memberships')return response([{business_id:BUSINESS,role:'owner',status:'active',permissions:[]}]);
    if(table==='account_access_state')return response([{status:'active'}]);
    assert.equal(options.headers.get('authorization'),'Bearer fixture-session');
    assert.equal(options.method||'GET','GET');
    assert.equal(url.searchParams.get('business_id')||url.searchParams.get('id'),'eq.'+BUSINESS);
    if(table==='dabbir_businesses')return response([{id:BUSINESS,country_code:'AE',currency_code:'AED',timezone:'Asia/Dubai'}]);
    if(table===failure)return response({message:'private upstream diagnostic'},503);
    if(table===malformed)return response(null);
    const rows=queryRows(tables[table]||[],url);
    if(options.headers.get('prefer')==='count=exact'&&!outcomesCountMissing){
      const unlimited=new URL(url);unlimited.searchParams.delete('limit');
      const total=queryRows(tables[table]||[],unlimited).length;
      return response(rows,200,{'content-range':(rows.length?'0-'+(rows.length-1):'*')+'/'+total});
    }
    return response(rows);
  });
  return calls;
}
async function invoke({businessId=BUSINESS,authorized=true}={}){
  const req={method:'GET',url:'/?business_id='+businessId,headers:{cookie:authorized?'__Host-dabbir_access=fixture-session':''}};
  const res={statusCode:200,headers:{},setHeader(name,value){this.headers[name]=value},end(body){this.body=JSON.parse(body)}};
  await handler(req,res);return res;
}
const row=(id,extra={})=>({id,business_id:BUSINESS,...extra});
const many=make=>Array.from({length:110},(_,i)=>make(i));

test('historical and simulated rows cannot hide current appointments, follow-ups, handoffs, conversations or orders',async t=>{
  const calls=fixture(t,{tables:{
    dabbir_appointments:[
      ...many(i=>row('old-'+i,{status:'confirmed',simulated:false,starts_at:iso(-86400000-i*60000)})),
      ...many(i=>row('completed-'+i,{status:'completed',simulated:false,starts_at:iso(1000+i)})),
      ...many(i=>row('demo-'+i,{status:'confirmed',simulated:true,starts_at:iso(2000+i)})),
      row('live-appointment',{status:'confirmed',simulated:false,starts_at:iso(3600000)}),
      row('foreign-appointment',{business_id:OTHER,status:'confirmed',simulated:false,starts_at:iso(3600000)}),
    ],
    dabbir_followups:[...many(i=>row('sent-'+i,{status:i%2?'SENT':'sent',due_at:iso(-86400000-i)})),row('live-followup',{status:'PENDING',due_at:iso(-60000)})],
    dabbir_handoffs:[...many(i=>row('closed-'+i,{state:i%2?'RESOLVED':'resolved',updated_at:iso(i)})),row('live-handoff',{state:'HUMAN_ACTIVE',updated_at:iso(-1000)})],
    dabbir_conversations:[...many(i=>row('normal-'+i,{state:'ai_active',updated_at:iso(i)})),row('live-conversation',{state:'action_required',updated_at:iso(-1000)})],
    dabbir_orders:[...many(i=>row('done-'+i,{status:'completed',simulated:false,created_at:iso(i)})),row('live-order',{status:'reserved',simulated:false,total_amount:120,currency_code:'AED',created_at:iso(-1000)})],
  }});
  const res=await invoke();
  assert.equal(res.statusCode,200);
  assert.equal(res.body.status,'needs_attention');
  assert.deepEqual(res.body.items.map(item=>item.id).sort(),['appointment:live-appointment','conversation:live-conversation','followup:live-followup','handoff:live-handoff','order:live-order']);
  assert.equal(res.body.metrics.total,5);
  assert.doesNotMatch(res.body.brief.ar,/لا توجد عناصر حرجة/);
  assert.ok(calls.every(call=>(call.options.method||'GET')==='GET'));
});

test('appointment and follow-up windows include their exact boundaries and exclude later work',async t=>{
  fixture(t,{tables:{
    dabbir_appointments:[
      row('now',{status:'confirmed',simulated:false,starts_at:iso(0)}),
      row('boundary',{status:'confirmed',simulated:null,starts_at:iso(86400000)}),
      row('later',{status:'confirmed',simulated:false,starts_at:iso(86400001)}),
    ],
    dabbir_followups:[row('due',{status:'PENDING',due_at:iso(86400000)}),row('later',{status:'PENDING',due_at:iso(86400001)})],
  }});
  const res=await invoke();
  assert.equal(res.statusCode,200);
  assert.deepEqual(res.body.items.map(item=>item.id).sort(),['appointment:boundary','appointment:now','followup:due']);
});

test('required upstream errors never return a clear dashboard or zero metrics',async t=>{
  fixture(t,{failure:'dabbir_appointments'});
  const res=await invoke();
  assert.equal(res.statusCode,503);
  assert.equal(res.body.ok,false);
  assert.equal(res.body.error,'APPOINTMENTS_LOOKUP_FAILED');
  assert.equal(res.body.metrics,undefined);
  assert.equal(res.body.status,undefined);
});

test('all fetched priorities remain available for the expanded owner list',async t=>{
  fixture(t,{tables:{dabbir_conversations:Array.from({length:18},(_,i)=>row('attention-'+i,{state:'action_required',updated_at:iso(-i)}))}});
  const res=await invoke();
  assert.equal(res.statusCode,200);
  assert.equal(res.body.metrics.total,18);
  assert.equal(res.body.items.length,18);
});

test('successful HTTP with a missing collection is unavailable, not an empty business',async t=>{
  fixture(t,{malformed:'dabbir_followups'});
  const res=await invoke();
  assert.equal(res.statusCode,502);
  assert.equal(res.body.ok,false);
  assert.equal(res.body.error,'FOLLOWUPS_LOOKUP_FAILED');
  assert.equal(res.body.metrics,undefined);
});

test('missing supplementary outcome evidence remains unavailable rather than claiming zero handled work',async t=>{
  fixture(t,{malformed:'dabbir_operation_outcomes'});
  const res=await invoke();
  assert.equal(res.statusCode,200);
  assert.equal(res.body.handled.available,false);
  assert.equal(res.body.handled.verified_autonomous_today,null);
  assert.equal(res.body.metrics.handled_verified_today,null);
});

test('handled today uses the exact scoped count even when the recent outcome page is full',async t=>{
  const verified=i=>row('outcome-'+i,{operation_type:'followup.capture_internal',outcome:'VERIFIED_SUCCESS',autonomous:true,completed_at:iso(-i*60000)});
  const calls=fixture(t,{tables:{dabbir_operation_outcomes:[
    ...Array.from({length:37},(_,i)=>verified(i)),
    {...verified(40),outcome:'FAILED'},
    {...verified(41),autonomous:false},
    {...verified(42),completed_at:iso(-86400000)},
    {...verified(43),business_id:OTHER},
  ]}});
  const res=await invoke();
  assert.equal(res.statusCode,200);
  assert.equal(res.body.handled.available,true);
  assert.equal(res.body.handled.verified_autonomous_today,37);
  assert.equal(res.body.metrics.handled_verified_today,37);
  assert.equal(res.body.handled.latest.length,3);
  assert.match(res.body.brief.ar,/37/);
  const read=calls.find(call=>call.url.pathname.endsWith('/dabbir_operation_outcomes'));
  assert.equal(read.options.headers.get('prefer'),'count=exact');
  assert.equal(read.url.searchParams.get('limit'),'20');
});

test('an absent exact outcome count is unavailable, never the length of a truncated recent page',async t=>{
  fixture(t,{outcomesCountMissing:true});
  const res=await invoke();
  assert.equal(res.statusCode,200);
  assert.equal(res.body.handled.available,false);
  assert.equal(res.body.handled.verified_autonomous_today,null);
});

test('unauthenticated and non-member business requests cannot read operational records',async t=>{
  const calls=fixture(t);
  assert.equal((await invoke({authorized:false})).statusCode,401);
  assert.equal(calls.length,0);
  assert.equal((await invoke({businessId:OTHER})).statusCode,403);
  assert.equal(calls.some(call=>call.url.pathname.endsWith('/dabbir_appointments')),false);
  assert.equal(calls.some(call=>call.url.pathname.endsWith('/dabbir_businesses')),false);
});

test('unfinished appointments earlier today need review without reviving terminal or simulated work',async t=>{
  const calls=fixture(t,{tables:{dabbir_appointments:[
    row('waiting',{status:'confirmed',simulated:false,starts_at:iso(-3600000)}),
    row('unfinished',{status:'in_progress',simulated:false,starts_at:iso(-7200000),ends_at:iso(-3600000)}),
    row('ongoing',{status:'in_progress',simulated:false,starts_at:iso(-60000),ends_at:iso(3600000)}),
    row('old-unresolved',{status:'confirmed',simulated:false,starts_at:iso(-86400000)}),
    ...['completed','cancelled','no_show','rejected'].map(status=>row(status,{status,simulated:false,starts_at:iso(-3600000)})),
    row('simulation',{status:'confirmed',simulated:true,starts_at:iso(-3600000)}),
  ]}});
  const res=await invoke();
  assert.equal(res.statusCode,200);
  assert.equal(res.body.status,'needs_attention');
  assert.deepEqual(res.body.items.map(item=>item.id).sort(),['appointment:ongoing','appointment:unfinished','appointment:waiting']);
  assert.equal(res.body.items.find(item=>item.entity_id==='waiting').severity,'critical');
  assert.equal(res.body.items.find(item=>item.entity_id==='unfinished').severity,'critical');
  assert.equal(res.body.items.find(item=>item.entity_id==='ongoing').severity,'info');
  assert.match(res.body.items.find(item=>item.entity_id==='waiting').detail_ar,/لا يعني إكمال الخدمة/);
  const read=calls.find(call=>call.url.pathname.endsWith('/dabbir_appointments'));
  assert.deepEqual(read.url.searchParams.getAll('starts_at'),['gte.2026-09-07T20:00:00.000Z','lte.2026-09-09T08:00:00.000Z']);
  assert.ok(calls.every(call=>(call.options.method||'GET')==='GET'));
});

test('invalid business IDs cannot fall back to the first accessible business',async t=>{
  const calls=fixture(t);
  for(const businessId of ['not-a-uuid','',BUSINESS+')']){
    const res=await invoke({businessId});
    assert.equal(res.statusCode,400);
    assert.equal(res.body.error,'INVALID_BUSINESS_ID');
  }
  assert.equal(calls.some(call=>call.url.pathname.endsWith('/dabbir_businesses')),false);
});
