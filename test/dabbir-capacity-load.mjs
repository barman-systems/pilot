import fs from 'node:fs';
import crypto from 'node:crypto';

const ORIGIN=String(process.env.PRODUCTION_ORIGIN||'https://pilot-taupe.vercel.app').replace(/\/$/,'');
const PROJECT_REF=String(process.env.SUPABASE_PROJECT_REF||'spohjzrsymsmzsseygtw').trim();
const QA_CONTROL_URL=`https://${PROJECT_REF}.supabase.co/functions/v1/barman-qa-suite-runner`;
const OIDC_AUDIENCE='dabbir-ai-qa';
const REPORT_PATH=process.env.CAPACITY_REPORT_PATH||'dabbir-capacity-report.json';
const RUN_ID=`capacity-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const RUN_LABEL=`DABBIR AI QA ${RUN_ID}`;
const CUSTOMER_COUNT=Math.min(1000,Math.max(100,Number(process.env.CUSTOMER_COUNT||1000)));
const RUNTIME_STAGES=(process.env.RUNTIME_STAGES||'50,100,250,500,750,1000').split(',').map(Number).filter(Number.isFinite);
const AI_STAGES=(process.env.AI_STAGES||'1,2,5,10,20,40,60,100').split(',').map(Number).filter(Number.isFinite);

const report={
  run_id:RUN_ID,
  production_origin:ORIGIN,
  started_at:new Date().toISOString(),
  completed_at:null,
  verdict:'RUNNING',
  customer_count:CUSTOMER_COUNT,
  setup:{},
  runtime_stages:[],
  ai_stages:[],
  capacity:{infrastructure_stable_concurrency:0,infrastructure_available_concurrency:0,ai_concurrency:0},
  cleanup:[],
  notes:[],
};

let oidcToken=null,owner=null,businessId=null;
const conversationIds=[];

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function pct(values,p){if(!values.length)return 0;const s=[...values].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.ceil((p/100)*s.length)-1)]||0;}
function small(v,max=240){const s=String(v??'').replace(/eyJ[A-Za-z0-9._-]{30,}/g,'[JWT]');return s.length<=max?s:s.slice(0,max)+'…';}
function assert(c,m){if(!c)throw new Error(m||'ASSERTION_FAILED');}

async function rawFetch(url,options={},timeoutMs=20000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  const started=Date.now();
  try{
    const response=await fetch(url,{redirect:'follow',...options,signal:controller.signal});
    const text=await response.text();
    let json=null;try{json=text?JSON.parse(text):null}catch{}
    return {ok:response.ok,status:response.status,text,json,duration_ms:Date.now()-started,response};
  }catch(error){return {ok:false,status:0,text:String(error?.message||error),json:null,duration_ms:Date.now()-started,response:null};}
  finally{clearTimeout(timer);}
}

class Session{
  constructor(){this.cookies=new Map();}
  capture(response){
    if(!response?.headers)return;
    const rows=typeof response.headers.getSetCookie==='function'?response.headers.getSetCookie():[response.headers.get('set-cookie')].filter(Boolean);
    for(const row of rows){const pair=String(row).split(';',1)[0];const i=pair.indexOf('=');if(i<=0)continue;const k=pair.slice(0,i).trim(),v=pair.slice(i+1).trim();if(v)this.cookies.set(k,v);else this.cookies.delete(k);}
  }
  cookieHeader(){return [...this.cookies.entries()].map(([k,v])=>`${k}=${v}`).join('; ');}
  async request(path,{method='GET',body,headers={},timeoutMs=20000}={}){
    const upper=method.toUpperCase();
    const h={accept:'application/json',...headers};
    if(this.cookies.size)h.cookie=this.cookieHeader();
    if(!['GET','HEAD'].includes(upper))h.origin=ORIGIN;
    let payload=body;
    if(body!==undefined&&typeof body!=='string'){payload=JSON.stringify(body);h['content-type']='application/json';}
    const result=await rawFetch(`${ORIGIN}${path}`,{method:upper,headers:h,body:payload},timeoutMs);
    this.capture(result.response);
    return result;
  }
}
const session=new Session();

async function getOidc(){
  if(oidcToken)return oidcToken;
  const url=String(process.env.ACTIONS_ID_TOKEN_REQUEST_URL||'').trim();
  const token=String(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN||'').trim();
  assert(url&&token,'GITHUB_OIDC_CONTEXT_REQUIRED');
  const sep=url.includes('?')?'&':'?';
  const r=await rawFetch(`${url}${sep}audience=${encodeURIComponent(OIDC_AUDIENCE)}`,{headers:{authorization:`Bearer ${token}`,accept:'application/json'}},15000);
  assert(r.ok&&r.json?.value,`OIDC_FAILED_${r.status}:${small(r.text)}`);
  oidcToken=String(r.json.value);return oidcToken;
}

async function qaControl(action,body={}){
  const r=await rawFetch(QA_CONTROL_URL,{method:'POST',headers:{authorization:`Bearer ${await getOidc()}`,'content-type':'application/json',accept:'application/json'},body:JSON.stringify({action,run_id:RUN_ID,...body})},30000);
  assert(r.ok&&r.json?.ok,`QA_${action}_FAILED_${r.status}:${small(r.text)}`);return r;
}

async function mapLimit(items,limit,fn){
  const results=new Array(items.length);let next=0;
  async function worker(){while(true){const i=next++;if(i>=items.length)return;results[i]=await fn(items[i],i);}}
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));return results;
}

function summarize(results){
  const durations=results.map(r=>r.duration_ms||0);
  const ok=results.filter(r=>r.ok).length;
  const statuses={};for(const r of results)statuses[r.status]=(statuses[r.status]||0)+1;
  return {requests:results.length,ok,errors:results.length-ok,error_rate:Number(((results.length-ok)/Math.max(1,results.length)).toFixed(4)),avg_ms:Math.round(durations.reduce((a,b)=>a+b,0)/Math.max(1,durations.length)),p50_ms:pct(durations,50),p95_ms:pct(durations,95),p99_ms:pct(durations,99),max_ms:Math.max(0,...durations),statuses};
}

async function createCustomers(){
  const ids=Array.from({length:CUSTOMER_COUNT},(_,i)=>i+1);
  const started=Date.now();
  const rows=await mapLimit(ids,40,async n=>{
    const r=await session.request('/api/start-conversation',{method:'POST',body:{business_id:businessId,display_name:`Capacity Customer ${String(n).padStart(4,'0')}`},timeoutMs:20000});
    if(r.ok&&r.json?.conversation?.id)conversationIds.push(r.json.conversation.id);
    return r;
  });
  const summary=summarize(rows);summary.wall_ms=Date.now()-started;return summary;
}

async function runtimeStage(concurrency){
  const jobs=Array.from({length:concurrency},(_,i)=>i);
  const started=Date.now();
  const results=await Promise.all(jobs.map(()=>session.request(`/api/dabbir-runtime-fast?business_id=${encodeURIComponent(businessId)}&summary=1`,{timeoutMs:20000})));
  const summary=summarize(results);summary.concurrency=concurrency;summary.wall_ms=Date.now()-started;
  summary.stable=summary.error_rate<=0.01&&summary.p95_ms<=2500&&summary.p99_ms<=6000;
  summary.available=summary.error_rate<=0.01&&summary.p95_ms<=15000;
  return summary;
}

async function prepareAiConversation(id){
  const r=await session.request('/api/chat-control',{method:'POST',body:{action:'return_to_ai',business_id:businessId,conversation_id:id},timeoutMs:15000});
  return r.ok;
}

async function aiStage(concurrency,offset){
  const selected=conversationIds.slice(offset,offset+concurrency);
  if(selected.length<concurrency)return {concurrency,requests:0,ok:0,errors:0,error_rate:1,p95_ms:0,p99_ms:0,max_ms:0,statuses:{},pass:false,detail:'INSUFFICIENT_CONVERSATIONS'};
  await mapLimit(selected,10,id=>prepareAiConversation(id));
  const started=Date.now();
  const results=await Promise.all(selected.map((id,i)=>session.request('/api/chat-customer',{method:'POST',body:{business_id:businessId,conversation_id:id,message:`اختبار سعة AI رقم ${offset+i+1}: هل المنتج متوفر؟`},timeoutMs:30000})));
  const summary=summarize(results);summary.concurrency=concurrency;summary.wall_ms=Date.now()-started;
  const aiReplies=results.filter(r=>r.ok&&r.json?.ai_message?.sender_type==='ai').length;
  summary.ai_replies=aiReplies;summary.ai_reply_rate=Number((aiReplies/Math.max(1,results.length)).toFixed(4));
  summary.pass=summary.error_rate<=0.05&&summary.ai_reply_rate>=0.95&&summary.p95_ms<=15000;
  return summary;
}

async function run(){
  const home=await rawFetch(ORIGIN,{headers:{accept:'text/html'}},15000);assert(home.ok,'PRODUCTION_UNREACHABLE');
  await getOidc();
  const boot=await qaControl('dabbir_ai_qa_bootstrap');owner=boot.json?.identities?.owner;assert(owner?.email&&owner?.password,'QA_OWNER_MISSING');
  const login=await session.request('/api/auth/login',{method:'POST',body:{email:owner.email,password:owner.password}});assert(login.ok&&login.json?.ok,'OWNER_LOGIN_FAILED');
  const create=await session.request('/api/dabbir-runtime-fast',{method:'POST',body:{action:'create_business',name:RUN_LABEL,business_type:'store',locale:'ar-AE'}});assert(create.ok&&create.json?.business_id,'BUSINESS_CREATE_FAILED');businessId=create.json.business_id;
  report.setup.business_id='[QA_BUSINESS]';

  const customerSetup=await createCustomers();report.setup.customers=customerSetup;
  assert(conversationIds.length>=Math.floor(CUSTOMER_COUNT*0.99),`CUSTOMER_CREATION_TOO_MANY_FAILURES_${conversationIds.length}/${CUSTOMER_COUNT}`);

  for(const stage of RUNTIME_STAGES){
    console.log(`RUNTIME LOAD stage=${stage}`);
    const result=await runtimeStage(stage);report.runtime_stages.push(result);
    console.log(JSON.stringify(result));
    if(result.stable)report.capacity.infrastructure_stable_concurrency=stage;
    if(result.available)report.capacity.infrastructure_available_concurrency=stage;
    await sleep(1200);
  }

  let offset=0;
  for(const stage of AI_STAGES){
    console.log(`AI LOAD stage=${stage}`);
    const result=await aiStage(stage,offset);report.ai_stages.push(result);offset+=stage;
    console.log(JSON.stringify(result));
    if(result.pass)report.capacity.ai_concurrency=stage;
    else break;
    await sleep(1500);
  }

  const stable=report.capacity.infrastructure_stable_concurrency;
  const available=report.capacity.infrastructure_available_concurrency;
  if(available>=1000)report.notes.push('Infrastructure remained available at the configured ceiling of 1000 concurrent clients; the real failure point is above this test ceiling.');
  else report.notes.push(`Infrastructure remained within availability thresholds through ${available} concurrent clients.`);
  report.notes.push(`Strict UX target (<=1% errors, p95<=2.5s) passed through ${stable} concurrent clients.`);
  report.notes.push('AI concurrency is reported separately because the current model/provider can become the external bottleneck before Vercel/Supabase infrastructure does.');
  report.verdict='PASS';
}

try{await run();}
catch(error){report.verdict='FAIL';report.notes.push(`FATAL: ${small(error?.stack||error?.message||error,500)}`);console.error(error);}
finally{
  if(owner?.id||businessId){
    try{const r=await qaControl('dabbir_ai_qa_cleanup',{business_id:businessId||undefined,owner_user_id:owner?.id||undefined});report.cleanup.push({status:'PASS',http_status:r.status});}
    catch(error){report.cleanup.push({status:'FAIL',detail:small(error?.message||error)});report.verdict='FAIL';}
  }
  report.completed_at=new Date().toISOString();
  fs.writeFileSync(REPORT_PATH,JSON.stringify(report,null,2));
  console.log(`DABBIR CAPACITY TEST: ${report.verdict}`);
  console.log(`Infrastructure stable concurrency: ${report.capacity.infrastructure_stable_concurrency}`);
  console.log(`Infrastructure available concurrency: ${report.capacity.infrastructure_available_concurrency}`);
  console.log(`AI concurrency: ${report.capacity.ai_concurrency}`);
  console.log(`Report: ${REPORT_PATH}`);
}

if(report.verdict!=='PASS')process.exitCode=1;
