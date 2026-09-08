import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL='https://exact-conversation-fixture.invalid';
process.env.SUPABASE_AUTH_URL=process.env.SUPABASE_URL;
process.env.SUPABASE_DATA_URL=process.env.SUPABASE_URL;
const {default:branchHandler}=await import('../api/branch-workspace.js');
const {default:fastHandler}=await import('../api/dabbir-runtime-fast.js');
const BUSINESS='10000000-0000-4000-8000-000000000001';
const OTHER='10000000-0000-4000-8000-000000000002';
const USER='20000000-0000-4000-8000-000000000001';
const BRANCH='30000000-0000-4000-8000-000000000001';
const FOREIGN_BRANCH='30000000-0000-4000-8000-000000000002';
const uuid=i=>'40000000-0000-4000-8000-'+String(i).padStart(12,'0');
const customerId=i=>'50000000-0000-4000-8000-'+String(i).padStart(12,'0');
const response=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});
const conversation=(i,extra={})=>({id:uuid(i),business_id:BUSINESS,branch_id:BRANCH,customer_id:customerId(i),channel_type:'web',state:'action_required',updated_at:new Date(Date.UTC(2026,8,8,12,0,i)).toISOString(),...extra});

function fixture(t,{rows,role='owner',customers=[],failExact=false}={}){
  const calls=[];
  t.mock.method(globalThis,'fetch',async(input,options={})=>{
    const url=new URL(input),table=url.pathname.split('/').at(-1);calls.push(url);
    if(url.pathname==='/auth/v1/user')return response({id:USER});
    if(table==='account_access_state')return response([{status:'active'}]);
    if(table==='dabbir_memberships')return response([{business_id:BUSINESS,user_id:USER,role,status:'active',permissions:[]}]);
    assert.equal(options.headers.get('authorization'),'Bearer fixture-session');
    assert.equal(options.method||'GET','GET');
    if(options.headers.get('prefer')==='count=exact')return response([] ,200,{'content-range':'*/0'});
    let all=[];
    if(table==='dabbir_businesses')all=[{id:BUSINESS,business_type:'salon',name:'اختبار',country_code:'AE',currency_code:'AED',timezone:'Asia/Dubai'}];
    if(table==='dabbir_business_branches')all=[{id:BRANCH,business_id:BUSINESS,status:'active',is_primary:true},{id:FOREIGN_BRANCH,business_id:BUSINESS,status:'active',is_primary:false}];
    if(table==='dabbir_membership_branches')all=[{business_id:BUSINESS,user_id:USER,branch_id:BRANCH}];
    if(table==='dabbir_conversations'){
      if(url.searchParams.has('id')&&failExact)return response({message:'fixture unavailable'},503);
      all=rows||[];
    }
    if(table==='dabbir_customers')all=customers.length?customers:(rows||[]).map(row=>({id:row.customer_id,business_id:row.business_id,display_name:'عميل '+row.id,metadata:{}}));
    if(table==='dabbir_messages')all=(rows||[]).map(row=>({id:'message-'+row.id,business_id:row.business_id,conversation_id:row.id,body:'رسالة '+row.id}));
    for(const [key,value] of url.searchParams){
      if(['select','order','limit'].includes(key))continue;
      if(value.startsWith('eq.'))all=all.filter(row=>String(row[key])===value.slice(3));
      else if(value.startsWith('neq.'))all=all.filter(row=>String(row[key])!==value.slice(4));
      else if(value.startsWith('in.('))all=all.filter(row=>value.slice(4,-1).split(',').includes(String(row[key])));
    }
    if(url.searchParams.get('order')==='updated_at.desc')all=[...all].sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')));
    return response(all.slice(0,Number(url.searchParams.get('limit')||all.length)));
  });
  return calls;
}

async function invoke(handler,conversationId,extra=''){
  const req={method:'GET',url:'/?business_id='+BUSINESS+'&conversation_id='+conversationId+extra,headers:{cookie:'__Host-dabbir_access=fixture-session'}};
  const res={statusCode:200,headers:{},setHeader(name,value){this.headers[name]=value},end(body){this.body=JSON.parse(body)}};
  await handler(req,res);return res;
}

test('a WhatsApp priority older than the recent fifty opens its exact branch-scoped conversation',async t=>{
  const rows=Array.from({length:55},(_,i)=>conversation(i+1));rows.push(conversation(0,{channel_type:'whatsapp'}));
  const calls=fixture(t,{rows});const res=await invoke(branchHandler,uuid(0),'&branch_id='+BRANCH);
  assert.equal(res.statusCode,200);assert.equal(res.body.selected_conversation_id,uuid(0));
  assert.equal(res.body.conversations.length,51);assert.equal(res.body.messages[0].conversation_id,uuid(0));
  assert.ok(res.body.customers.some(row=>row.id===customerId(0)));
  const exact=calls.find(url=>url.pathname.endsWith('/dabbir_conversations')&&url.searchParams.has('id'));
  assert.equal(exact.searchParams.get('business_id'),'eq.'+BUSINESS);
  assert.equal(exact.searchParams.get('branch_id'),'eq.'+BRANCH);
});

test('exact branch lookup cannot select another branch for a restricted employee',async t=>{
  fixture(t,{role:'employee',rows:[conversation(1),conversation(0,{branch_id:FOREIGN_BRANCH})]});
  const res=await invoke(branchHandler,uuid(0),'&branch_id='+BRANCH);
  assert.equal(res.statusCode,404);assert.equal(res.body.error,'CONVERSATION_NOT_FOUND');assert.equal(res.body.selected_conversation_id,undefined);
});

test('a conversation belonging to another business is never replaced with a local customer',async t=>{
  fixture(t,{rows:[conversation(1),conversation(0,{business_id:OTHER})]});
  for(const handler of [branchHandler,fastHandler]){
    const res=await invoke(handler,uuid(0));assert.equal(res.statusCode,404);assert.equal(res.body.error,'CONVERSATION_NOT_FOUND');
  }
});

test('the fast runtime loads an older exact record and its customer beyond the list limits',async t=>{
  const rows=Array.from({length:85},(_,i)=>conversation(i+1));rows.push(conversation(0));
  const calls=fixture(t,{rows});const res=await invoke(fastHandler,uuid(0));
  assert.equal(res.statusCode,200);assert.equal(res.body.selected_conversation_id,uuid(0));
  assert.equal(res.body.messages[0].conversation_id,uuid(0));assert.ok(res.body.customers.some(row=>row.id===customerId(0)));
  assert.ok(calls.some(url=>url.pathname.endsWith('/dabbir_customers')&&url.searchParams.get('id')==='eq.'+customerId(0)));
});

test('an explicit record remains exact when another customer has the same normalized name',async t=>{
  const rows=[conversation(1,{state:'human_active'}),conversation(0)];
  const customers=rows.map(row=>({id:row.customer_id,business_id:BUSINESS,display_name:'أحمد علي',metadata:{source:'dabbir_web_runtime'}}));
  fixture(t,{rows,customers});const res=await invoke(fastHandler,uuid(0));
  assert.equal(res.statusCode,200);assert.equal(res.body.selected_conversation_id,uuid(0));
  assert.ok(res.body.conversations.some(row=>row.id===uuid(0)));assert.equal(res.body.messages[0].conversation_id,uuid(0));
});

test('an unavailable exact lookup stays an error instead of opening the first customer',async t=>{
  fixture(t,{rows:[conversation(1)],failExact:true});
  for(const handler of [branchHandler,fastHandler]){
    const res=await invoke(handler,uuid(0));assert.equal(res.statusCode,503);assert.equal(res.body.ok,false);assert.equal(res.body.selected_conversation_id,undefined);
  }
});

test('an invalid explicit conversation ID cannot fall back to an unrelated customer',async t=>{
  fixture(t,{rows:[conversation(1)]});
  for(const handler of [branchHandler,fastHandler]){
    const res=await invoke(handler,'not-a-conversation-id');assert.equal(res.statusCode,400);assert.equal(res.body.error,'INVALID_CONVERSATION_ID');
  }
});
