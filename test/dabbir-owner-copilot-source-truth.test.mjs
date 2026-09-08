import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import handler from '../api/owner-copilot.js';
import { SUPABASE_AUTH_URL } from '../api/_auth-core.js';

const businessId='11111111-1111-4111-8111-111111111111';
const userId='22222222-2222-4222-8222-222222222222';
const foreignBusinessId='33333333-3333-4333-8333-333333333333';
const token=['test',Buffer.from(JSON.stringify({sub:userId,iss:`${SUPABASE_AUTH_URL}/auth/v1`,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'test'].join('.');
const sources=['dabbir_products','dabbir_inventory','dabbir_orders','dabbir_expenses'];
const jsonResponse=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});

async function request({failedSource,upstream,empty=false,method='POST',requestedBusiness=businessId,membershipRole='owner'}={}){
  const originalFetch=globalThis.fetch;
  const originalGeminiKey=process.env.GEMINI_API_KEY;
  const calls=[];
  let modelCalls=0;
  // Synthetic provider configuration makes any unintended AI call observable.
  process.env.GEMINI_API_KEY='fixture-provider-key';
  globalThis.fetch=async(url,options={})=>{
    const target=new URL(String(url),'https://fixture.invalid');
    calls.push({path:target.pathname,query:target.search,method:options.method||'GET'});
    if(!target.pathname.startsWith('/rest/v1/')){
      modelCalls++;
      return jsonResponse({choices:[{message:{content:'Verified fixture answer'}}]});
    }
    const table=target.pathname.slice('/rest/v1/'.length);
    if(table==='dabbir_memberships')return jsonResponse([{business_id:businessId,role:membershipRole,status:'active',permissions:[]}]);
    if(table==='dabbir_businesses')return jsonResponse([{id:businessId,name:'Fixture business',business_type:'store',country_code:'AE',currency_code:'AED',timezone:'Asia/Dubai'}]);
    if(table===failedSource)return upstream();
    if(new Headers(options.headers).get('prefer')==='count=exact')return jsonResponse([] ,200,{'content-range':'*/0'});
    if(!empty){
      if(table==='dabbir_products')return jsonResponse([{id:'product-1',name:'Fixture product',sku:'FIX-1',price_aed:80,active:true}]);
      if(table==='dabbir_inventory')return jsonResponse([{product_id:'product-1',quantity:12,reserved:1}]);
      if(table==='dabbir_orders')return jsonResponse([{id:'order-1',status:'completed',total_aed:120,paid_aed:80,simulated:false}]);
      if(table==='dabbir_expenses')return jsonResponse([{id:'expense-1',amount_aed:15,category:'supplies'}]);
    }
    return jsonResponse([]);
  };
  const body={business_id:requestedBusiness,message:'كم المبيعات اليوم؟',language:'ar'};
  const req=Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method=method;
  req.url=`/api/owner-copilot?business_id=${requestedBusiness}`;
  req.headers={host:'fixture.invalid',origin:'https://fixture.invalid',cookie:`__Host-dabbir_access=${encodeURIComponent(token)}`};
  let payload;
  const headers=new Map();
  const res={statusCode:0,setHeader(name,value){headers.set(name,value)},end(value){payload=JSON.parse(value)}};
  try{await handler(req,res)}finally{
    globalThis.fetch=originalFetch;
    if(originalGeminiKey===undefined)delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY=originalGeminiKey;
  }
  return {status:res.statusCode,body:payload,calls,modelCalls,headers};
}

function assertUnavailable(result){
  assert.equal(result.status,503);
  assert.deepEqual(result.body,{ok:false,error:'OWNER_SNAPSHOT_UNAVAILABLE',retryable:true,external_side_effects:false});
  assert.equal(result.modelCalls,0,'no AI inference may receive an incomplete financial snapshot');
  assert.equal(result.body.metrics,undefined);
  assert.equal(result.body.answer,undefined);
  assert.equal(result.headers.get('cache-control'),'no-store');
  assert.ok(result.calls.every(call=>call.method==='GET'),'failed reads must not trigger a mutation');
}

for(const failedSource of sources){
  test(`${failedSource}: upstream failure cannot become a verified zero`,async()=>{
    const result=await request({failedSource,upstream:()=>jsonResponse({message:'private upstream diagnostic'},503)});
    assertUnavailable(result);
    assert.equal(JSON.stringify(result.body).includes('private upstream'),false);
  });
  test(`${failedSource}: HTTP 200 requires an array before any inference`,async()=>{
    for(const payload of [null,{}, {message:'provider error'},0,'invalid']){
      assertUnavailable(await request({failedSource,upstream:()=>jsonResponse(payload)}));
    }
  });
}

test('interrupted and malformed source responses are safely retryable',async()=>{
  for(const upstream of [()=>{throw new Error('connection lost with private details')},()=>new Response('not-json',{status:200})]){
    assertUnavailable(await request({failedSource:'dabbir_orders',upstream}));
  }
});

test('a retry uses fresh evidence and preserves verified financial values',async()=>{
  assertUnavailable(await request({failedSource:'dabbir_orders',upstream:()=>jsonResponse({},502)}));
  const result=await request();
  assert.equal(result.status,200);
  assert.equal(result.body.ok,true);
  assert.equal(result.body.metrics.sales_today,120);
  assert.equal(result.body.metrics.cash_collected_today,80);
  assert.equal(result.body.metrics.receivables_today,40);
  assert.equal(result.body.metrics.expenses_today,15);
  assert.equal(result.body.metrics.low_stock_products,0);
  assert.equal(result.modelCalls,1);
  for(const source of sources){
    const call=result.calls.find(call=>call.path===`/rest/v1/${source}`);
    assert.ok(call?.query.includes(`business_id=eq.${businessId}`));
  }
});

test('genuine empty arrays remain valid zero activity',async()=>{
  const result=await request({empty:true});
  assert.equal(result.status,200);
  for(const key of ['sales_today','cash_collected_today','receivables_today','expenses_today','low_stock_products','completed_sales_today'])assert.equal(result.body.metrics[key],0);
  assert.equal(result.modelCalls,1);
});

test('authorization failure stays denied instead of a retryable source outage',async()=>{
  for(const status of [401,403]){
    const result=await request({failedSource:'dabbir_orders',upstream:()=>jsonResponse({message:'private permission detail'},status)});
    assert.equal(result.status,status);
    assert.equal(result.body.ok,false);
    assert.equal(result.body.retryable,undefined);
    assert.equal(result.modelCalls,0);
    assert.equal(result.body.metrics,undefined);
    assert.equal(JSON.stringify(result.body).includes('private permission'),false);
  }
});

test('owner and tenant boundaries reject requests before loading business data',async()=>{
  for(const options of [{membershipRole:'viewer'},{requestedBusiness:foreignBusinessId}]){
    const result=await request(options);
    assert.equal(result.status,403);
    assert.equal(result.modelCalls,0);
    assert.equal(result.calls.length,1);
    assert.equal(result.calls[0].path,'/rest/v1/dabbir_memberships');
  }
});

test('GET outcome proof remains independent from store sources',async()=>{
  const result=await request({method:'GET',failedSource:'dabbir_orders',upstream:()=>assert.fail('GET must not request store data')});
  assert.equal(result.status,200);
  assert.equal(result.body.proof.available,true);
  assert.equal(result.modelCalls,0);
  assert.equal(result.calls.some(call=>sources.includes(call.path.slice('/rest/v1/'.length))),false);
});
