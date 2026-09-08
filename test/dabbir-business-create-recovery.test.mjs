import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import createBusiness from '../api/gcc-create-business.js';

const USER='00000000-0000-4000-8000-000000000001';
const BUSINESS='00000000-0000-4000-8000-000000000002';
const INPUT={action:'create_business',name:'Test activity',business_type:'services',country_code:'AE',locale:'ar-AE'};
const ROW={id:BUSINESS,country_code:'AE',currency_code:'AED',timezone:'Asia/Dubai',phone_country_prefix:'+971'};
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});

async function apiAttempt({rpc=()=>response([{business_id:BUSINESS}]),readback=()=>response([ROW])}={}){
  const original=globalThis.fetch,calls=[];
  globalThis.fetch=async url=>{
    calls.push(String(url));
    if(String(url).endsWith('/auth/v1/user'))return response({id:USER});
    if(String(url).includes('/rest/v1/account_access_state?'))return response([]);
    if(String(url).includes('/rest/v1/rpc/dabbir_create_business'))return rpc();
    if(String(url).includes('/rest/v1/dabbir_businesses?'))return readback();
    assert.fail('Unexpected external request');
  };
  const req=Readable.from([Buffer.from(JSON.stringify(INPUT))]);
  req.method='POST';req.headers={host:'dabbir.example.invalid',origin:'https://dabbir.example.invalid',cookie:'__Host-dabbir_access=test-token'};
  let body;const res={setHeader(){},end(value){body=JSON.parse(value)}};
  try{await createBusiness(req,res)}finally{globalThis.fetch=original}
  return {status:res.statusCode,body,calls};
}

for(const readback of [()=>response({message:'private diagnostic'},503),()=>{throw Error('private network error')},()=>response([{...ROW,id:'wrong-business'}])]){
  test('RPC success followed by failed readback preserves the created ID and blocks recreation',async()=>{
    const result=await apiAttempt({readback});
    assert.equal(result.body.ok,false);
    assert.equal(result.body.business_id,BUSINESS);
    assert.equal(result.body.state,'CREATED_VERIFICATION_PENDING');
    assert.equal(result.body.retry_create_blocked,true);
    assert.equal(result.body.verified_persisted,false);
    assert.equal(result.body.next_action,'verify_existing_business');
    assert.equal(JSON.stringify(result.body).includes('private'),false);
    assert.equal(result.calls.filter(url=>url.includes('/rpc/dabbir_create_business')).length,1);
  });
}

for(const rpc of [()=>{throw Error('connection lost')},()=>response({})]){
  test('an unknown RPC outcome requires reviewing existing activities instead of blind retry',async()=>{
    const result=await apiAttempt({rpc});
    assert.equal(result.body.business_id,null);
    assert.equal(result.body.outcome_uncertain,true);
    assert.equal(result.body.retry_create_blocked,true);
    assert.equal(result.body.next_action,'review_business_list');
    assert.equal(result.calls.filter(url=>url.includes('/rpc/dabbir_create_business')).length,1);
  });
}

test('a matching persisted business and market remain the only verified API success',async()=>{
  const result=await apiAttempt();
  assert.equal(result.status,200);
  assert.equal(result.body.ok,true);
  assert.equal(result.body.business_id,BUSINESS);
  assert.equal(result.body.verified_persisted,true);
});

const page=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const helper=page.slice(page.indexOf('// Business creation recovery:'),page.indexOf("$('#businessForm').onsubmit="));
function uiHarness({reply,load,language='ar',storage=new Map(),user=USER}={}){
  const calls=[],loads=[],message={children:[],_text:''};
  Object.defineProperty(message,'textContent',{get(){return this._text},set(value){this._text=value;this.children=[]}});
  message.appendChild=child=>message.children.push(child);
  const context=vm.createContext({
    window:{},lang:language,workspace:{user:{id:user},business:{id:'previous'},membership:{business_id:'previous'}},
    sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    document:{createElement:()=>({})},
    api:async(url,options)=>{calls.push({url,options});return reply(url,options)},
    loadRuntime:async id=>{loads.push(id);if(load)await load(context,id);else context.workspace={user:{id:USER},business:{id},membership:{business_id:id}}},
  });
  vm.runInContext(helper,context);
  return {calls,loads,message,context,storage,run:payload=>context.window.__dabbirCreateBusinessSafely(payload||INPUT,{statusElement:message}),label:()=>context.window.__dabbirBusinessCreationLabel()};
}

test('known ID retries verify the original activity even if the user edits the form',async()=>{
  let canLoad=false;
  const ui=uiHarness({reply:async()=>({r:{ok:false,status:503},j:{business_id:BUSINESS,retry_create_blocked:true}}),load:async(ctx,id)=>{if(canLoad)ctx.workspace={user:{id:USER},business:{id},membership:{business_id:id}}}});
  assert.equal((await ui.run()).ok,false);
  assert.match(ui.message.textContent,/لن ننشئ نسخة أخرى/);
  canLoad=true;
  const recovered=await ui.run({...INPUT,name:'Changed activity'});
  assert.equal(recovered.ok,true);
  assert.equal(recovered.business_id,BUSINESS);
  assert.equal(ui.calls.length,1);
  assert.deepEqual(ui.loads,[BUSINESS,BUSINESS]);
});

test('a wrong runtime membership never proves creation success',async()=>{
  const ui=uiHarness({reply:async()=>({r:{ok:true,status:200},j:{ok:true,business_id:BUSINESS}}),load:async(ctx,id)=>{ctx.workspace={user:{id:USER},business:{id},membership:{business_id:'other'}}}});
  assert.equal((await ui.run()).ok,false);
  assert.equal((await ui.run()).ok,false);
  assert.equal(ui.calls.length,1);
  assert.match(ui.label(),/التحقق/);
});

test('an uncertain result is recovered by choosing an activity from the authenticated list',async()=>{
  const ui=uiHarness({reply:async url=>url==='/api/business-portfolio'
    ? {r:{ok:true,status:200},j:{ok:true,businesses:[{id:BUSINESS,name:'Existing test activity'}]}}
    : {r:{ok:false,status:503},j:{outcome_uncertain:true}}});
  await ui.run();
  assert.match(ui.label(),/تحقق من أنشطتي/);
  await ui.run();
  assert.equal(ui.message.children.length,2);
  ui.message.children[0].onclick();
  assert.equal((await ui.run()).ok,true);
  assert.deepEqual(ui.calls.map(call=>call.url),['/api/dabbir-runtime','/api/business-portfolio']);
  assert.deepEqual(ui.loads,[BUSINESS]);
});

test('an unreadable activity list cannot unlock another create request',async()=>{
  const ui=uiHarness({reply:async()=>({r:{ok:false,status:503},j:{outcome_uncertain:true}})});
  await ui.run();await ui.run();await ui.run();
  assert.equal(ui.calls.filter(call=>call.options?.method==='POST').length,1);
  assert.equal(ui.message.children.length,0);
  assert.match(ui.message.textContent,/تعذر قراءة أنشطتك/);
});

test('a new creation requires an explicit reviewed-list decision after an unknown outcome',async()=>{
  const ui=uiHarness({reply:async url=>url==='/api/business-portfolio'
    ? {r:{ok:true,status:200},j:{ok:true,businesses:[]}}
    : {r:{ok:false,status:503},j:{outcome_uncertain:true}}});
  await ui.run();await ui.run();
  assert.equal(ui.calls.filter(call=>call.options?.method==='POST').length,1);
  ui.message.children[0].onclick();
  await ui.run();
  assert.equal(ui.calls.filter(call=>call.options?.method==='POST').length,2);
});

test('overlapping creation calls share the pending operation and cannot submit twice',async()=>{
  let finish;
  const waiting=new Promise(resolve=>{finish=resolve});
  const ui=uiHarness({reply:async()=>waiting});
  const first=ui.run();
  assert.equal((await ui.run()).ok,false);
  assert.equal(ui.calls.length,1);
  finish({r:{ok:true,status:200},j:{ok:true,business_id:BUSINESS}});
  assert.equal((await first).ok,true);
});

test('reload preserves a known created ID and retries verification without another POST',async()=>{
  const first=uiHarness({reply:async()=>({r:{ok:false,status:503},j:{business_id:BUSINESS}}),load:async()=>{throw Error('offline')}});
  await first.run();
  const reloaded=uiHarness({storage:first.storage,reply:async()=>assert.fail('recovery must not create again')});
  assert.equal((await reloaded.run()).ok,true);
  assert.deepEqual(reloaded.loads,[BUSINESS]);
  assert.equal(reloaded.storage.size,0);
});

test('reload during an in-flight creation requires reading the account list before retrying',async()=>{
  let finish;
  const waiting=new Promise(resolve=>{finish=resolve});
  const first=uiHarness({reply:async()=>waiting});
  const request=first.run();
  assert.equal(first.storage.size,1);
  const saved=JSON.parse([...first.storage.values()][0]);
  assert.deepEqual(Object.keys(saved).sort(),['business_id','owner','state']);
  assert.equal(saved.state,'OUTCOME_UNCERTAIN');
  assert.equal(JSON.stringify(saved).includes(INPUT.name),false);
  const reloaded=uiHarness({storage:first.storage,reply:async url=>{assert.equal(url,'/api/business-portfolio');return {r:{ok:true},j:{ok:true,businesses:[]}}}});
  await reloaded.run();
  assert.deepEqual(reloaded.calls.map(call=>call.url),['/api/business-portfolio']);
  finish({r:{ok:false,status:503},j:{outcome_uncertain:true}});
  await request;
});

test('pending recovery from one account is not restored for another account',async()=>{
  const first=uiHarness({reply:async()=>({r:{ok:false,status:503},j:{outcome_uncertain:true}})});
  await first.run();
  const second=uiHarness({storage:first.storage,user:'another-user',reply:async()=>({r:{ok:false,status:400},j:{ok:false}})});
  assert.equal(second.label(),null);
  await second.run();
  assert.equal(second.calls[0].options.method,'POST');
  assert.equal(first.storage.size,1,'the other account recovery must remain intact');
});
