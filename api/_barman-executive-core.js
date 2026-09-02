import { createHmac, timingSafeEqual } from 'node:crypto';
import { getVercelOidcToken } from '@vercel/oidc';
import { SUPABASE_URL } from './_auth-core.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';

const GATEWAY_ENDPOINT='https://ai-gateway.vercel.sh/v1/chat/completions';
const DEFAULT_MODEL='minimax/minimax-m3-free';
const DABBIR_ORIGIN='https://dabbir.bmalman.com';
const clean=(value,max=4000)=>String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);

export function serviceRoleKey(env=process.env){
  const key=clean(env.SUPABASE_SERVICE_ROLE_KEY,8192);
  if(!key||key.startsWith('sb_publishable_'))throw Object.assign(new Error('BARMAN_SERVICE_ROLE_NOT_CONFIGURED'),{status:503});
  return key;
}

export function signedBody(body,key,timestamp=Math.floor(Date.now()/1000)){
  const raw=typeof body==='string'?body:JSON.stringify(body);
  return {timestamp:String(timestamp),signature:createHmac('sha256',key).update(`${timestamp}.${raw}`).digest('hex'),raw};
}

export function verifySignedBody(raw,timestamp,signature,key,now=Math.floor(Date.now()/1000)){
  const ts=Number(timestamp);
  if(!Number.isFinite(ts)||Math.abs(now-ts)>300)return false;
  const expected=createHmac('sha256',key).update(`${timestamp}.${raw}`).digest('hex');
  const a=Buffer.from(expected),b=Buffer.from(clean(signature,256));
  return a.length===b.length&&a.length>0&&timingSafeEqual(a,b);
}

export async function adminRpc(key,name,params={}){
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(name)}`,{
    method:'POST',cache:'no-store',redirect:'manual',
    headers:supabaseKeyHeaders(key,{accept:'application/json','content-type':'application/json','prefer':'return=representation'}),
    body:JSON.stringify(params),signal:AbortSignal.timeout(15000),
  });
  const text=await response.text();let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=null}
  if(!response.ok)throw Object.assign(new Error(payload?.message||payload?.code||`${name.toUpperCase()}_FAILED`),{status:response.status});
  return payload;
}

export function deterministicDecision(text){
  const value=clean(text,4000);
  const normalized=value.toLowerCase();
  if(/^(\/status|هل نفذت|هل تم|وين وصلت|ما الحالة|الحالة|حاله|status)[؟?]?$/i.test(value))
    return {kind:'status',reply:'سأعرض لك الحالة الحقيقية لآخر الأوامر، دون إنشاء أمر جديد.',command_text:'',priority:'P1'};
  if(/^(وينك|مرحبا|هلا|السلام|شكرا|شكراً|من انت|من أنت)[؟?]?$/i.test(value))
    return {kind:'chat',reply:'أنا BARMAN Executive OS. أتابع التنفيذ والأدلة، وأفصل الحديث العادي عن الأوامر.',command_text:'',priority:'P2'};
  const explicit=/(نفذ|نفّذ|أصلح|اصلح|ابن|ابدأ|ابدا|غيّر|غير|انشر|اربط|راجع|افحص|أنشئ|انشئ|جهز|طوّر|طور)/i.test(value);
  if(explicit)return {kind:'command',reply:'استلمت الهدف التنفيذي وسأدخله دورة التنفيذ.',command_text:value,priority:/عاجل|حرج|p0/i.test(normalized)?'P0':'P1'};
  return {kind:'chat',reply:'فهمت رسالتك. إذا أردتها مهمة تنفيذية اذكر النتيجة المطلوبة بوضوح، وسأتابعها حتى دليل أو عائق حقيقي.',command_text:'',priority:'P2'};
}

async function gatewayCredential(env=process.env){
  if(env.AI_GATEWAY_API_KEY)return String(env.AI_GATEWAY_API_KEY);
  if(env.VERCEL_OIDC_TOKEN)return String(env.VERCEL_OIDC_TOKEN);
  try{return String(await getVercelOidcToken()||'')}catch{return ''}
}

function outputJson(payload){
  let value=String(payload?.choices?.[0]?.message?.content||'').trim();
  value=value.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{return JSON.parse(value)}catch{return null}
}

export async function decideExecutiveMessage({text,memory=[],commands=[],env=process.env}){
  const fallback=deterministicDecision(text);
  const credential=await gatewayCredential(env);
  if(!credential)return {...fallback,brain_state:'DETERMINISTIC_FALLBACK',brain_error:'GATEWAY_CREDENTIAL_MISSING'};
  const model=clean(env.BARMAN_AI_GATEWAY_MODEL||env.DABBIR_AI_GATEWAY_MODEL||DEFAULT_MODEL,120);
  const system=[
    'You are BARMAN Executive OS, the sole executive AI for DABBIR.',
    'Reply in concise natural Arabic. Separate normal conversation from status checks and executable commands.',
    'Never claim execution from QUEUED or IN_PROGRESS. DONE requires verified evidence.',
    'A status question such as هل نفذت or وين وصلت is status, never a new command.',
    'Only classify command when the owner clearly asks for an action or outcome.',
    'Return JSON only: {"kind":"chat|status|command","reply":"...","command_text":"...","priority":"P0|P1|P2|P3"}.',
    'P0 is only an active critical incident. Financial/legal/KYC/OTP remain owner-only.',
  ].join('\n');
  try{
    const response=await fetch(GATEWAY_ENDPOINT,{
      method:'POST',headers:{authorization:`Bearer ${credential}`,'content-type':'application/json'},
      body:JSON.stringify({model,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify({message:clean(text),memory:Array.isArray(memory)?memory.slice(-16):[],commands:Array.isArray(commands)?commands.slice(0,8):[]})}],temperature:0.1,max_tokens:600,stream:false}),
      signal:AbortSignal.timeout(12000),
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(`GATEWAY_HTTP_${response.status}`);
    const decision=outputJson(payload);
    if(!decision||!['chat','status','command'].includes(decision.kind))throw new Error('GATEWAY_INVALID_DECISION');
    return {
      kind:decision.kind,
      reply:clean(decision.reply,1800)||fallback.reply,
      command_text:decision.kind==='command'?clean(decision.command_text||text,4000):'',
      priority:/^P[0-3]$/.test(String(decision.priority||'').toUpperCase())?String(decision.priority).toUpperCase():fallback.priority,
      brain_state:'AI_GATEWAY',model,
    };
  }catch(error){return {...fallback,brain_state:'DETERMINISTIC_FALLBACK',brain_error:clean(error?.message||error,160),model}}
}

async function probe(url){
  const started=Date.now();
  try{
    const response=await fetch(url,{cache:'no-store',redirect:'follow',signal:AbortSignal.timeout(12000)});
    const body=await response.text();
    return {url,status:response.status,ok:response.ok,latency_ms:Date.now()-started,final_url:response.url,vercel_id:response.headers.get('x-vercel-id'),body:body.slice(0,1800)};
  }catch(error){return {url,status:0,ok:false,latency_ms:Date.now()-started,error:clean(error?.message||error,200)}}
}

export async function observeDabbirLive(){
  const [site,capability,commit]=await Promise.all([
    probe(DABBIR_ORIGIN),
    probe(`${DABBIR_ORIGIN}/api/qa-capability`),
    probe('https://api.github.com/repos/barman-systems/pilot/commits/main'),
  ]);
  let capabilityJson=null,commitJson=null;
  try{capabilityJson=JSON.parse(capability.body||'')}catch{}
  try{commitJson=JSON.parse(commit.body||'')}catch{}
  const sha=clean(process.env.VERCEL_GIT_COMMIT_SHA||commitJson?.sha||'',64);
  const healthy=site.ok&&capability.ok&&capabilityJson?.ok===true&&capabilityJson?.supabase_project_ref==='fphpoysqdsceniwduxjq';
  return {
    healthy,observed_at:new Date().toISOString(),region:clean(process.env.VERCEL_REGION||site.vercel_id||'UNAVAILABLE',160),
    deployment_id:clean(process.env.VERCEL_DEPLOYMENT_ID||'UNAVAILABLE',160),commit_sha:sha||'UNAVAILABLE',
    site:{status:site.status,latency_ms:site.latency_ms,final_url:site.final_url},
    database:{project_ref:capabilityJson?.supabase_project_ref||'UNAVAILABLE',server_admin_configured:capabilityJson?.server_admin_configured===true},
    probes:{site_ok:site.ok,capability_ok:capability.ok},
  };
}

export function runtimeEvidence(snapshot){
  return [
    {type:'url',reference:DABBIR_ORIGIN,verified:snapshot.site.status>=200&&snapshot.site.status<400,details:snapshot.site},
    {type:'query',reference:'dabbir-qa-capability',verified:snapshot.database.project_ref==='fphpoysqdsceniwduxjq',details:snapshot.database},
    {type:'commit',reference:snapshot.commit_sha,verified:snapshot.commit_sha!=='UNAVAILABLE',details:{deployment_id:snapshot.deployment_id,region:snapshot.region}},
  ];
}

export async function telegramRoute(key,commandId){
  const cfg=await adminRpc(key,'barman_telegram_config_v1',{});
  const response=await fetch(`${SUPABASE_URL}/rest/v1/barman_telegram_updates?command_id=eq.${encodeURIComponent(commandId)}&select=chat_id&order=created_at.desc&limit=1`,{
    headers:supabaseKeyHeaders(key,{accept:'application/json'}),cache:'no-store',signal:AbortSignal.timeout(10000),
  });
  const rows=response.ok?await response.json().catch(()=>[]):[];
  return {token:clean(cfg?.bot_token,4096),chat_id:Array.isArray(rows)&&rows[0]?.chat_id?Number(rows[0].chat_id):null};
}

export async function notifyTelegram(route,text){
  if(!route?.token||!route?.chat_id)return {sent:false,reason:'NO_TELEGRAM_ROUTE'};
  const response=await fetch(`https://api.telegram.org/bot${route.token}/sendMessage`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:route.chat_id,text:clean(text,3900)}),signal:AbortSignal.timeout(10000),
  });
  return {sent:response.ok,status:response.status};
}
