import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.112.2";

const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const BROWSER='https://barman-browser-worker.vercel.app/api/qa';
const PROTECTED_ACTION='dabbir_protected_browser_smoke';
const ALLOWED_HOST='dabbir-nd56cm4j5v-3619s-projects.vercel.app';
const SAFE_TARGET=`https://${ALLOWED_HOST}/`;
const GH_ISSUER='https://token.actions.githubusercontent.com';
const GH_REPOSITORY='barman-systems/pilot';
const GH_REF='refs/heads/main';
const GH_WORKFLOW_REF='barman-systems/pilot/.github/workflows/dabbir-protected-live-smoke.yml@refs/heads/main';
const GH_AUDIENCE='dabbir-protected-browser-qa';
const GH_EVENTS=new Set(['push','workflow_dispatch']);

function b64urlDecode(value:string){
  const padded=value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4);
  const binary=atob(padded);
  return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
function decodeJsonPart(value:string){return JSON.parse(new TextDecoder().decode(b64urlDecode(value)))}

async function verifyGitHubOidc(req:Request){
  const authHeader=req.headers.get('authorization')||'';
  if(!authHeader.startsWith('Bearer '))throw new Error('OIDC_REQUIRED');
  const token=authHeader.slice(7).trim(),parts=token.split('.');
  if(parts.length!==3)throw new Error('OIDC_FORMAT_INVALID');
  const header=decodeJsonPart(parts[0]),payload=decodeJsonPart(parts[1]);
  if(header?.alg!=='RS256'||!header?.kid)throw new Error('OIDC_ALG_INVALID');
  const jwksResponse=await fetch('https://token.actions.githubusercontent.com/.well-known/jwks',{headers:{accept:'application/json'},signal:AbortSignal.timeout(10000)});
  if(!jwksResponse.ok)throw new Error('OIDC_JWKS_UNAVAILABLE');
  const jwks=await jwksResponse.json(),jwk=(jwks?.keys||[]).find((key:any)=>key.kid===header.kid&&key.kty==='RSA');
  if(!jwk)throw new Error('OIDC_KEY_NOT_FOUND');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,b64urlDecode(parts[2]),new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if(!valid)throw new Error('OIDC_SIGNATURE_INVALID');
  const now=Math.floor(Date.now()/1000);
  if(payload.iss!==GH_ISSUER)throw new Error('OIDC_ISSUER_DENIED');
  const audiences=Array.isArray(payload.aud)?payload.aud:[payload.aud];
  if(!audiences.includes(GH_AUDIENCE))throw new Error('OIDC_AUDIENCE_DENIED');
  if(Number(payload.exp||0)<=now||Number(payload.nbf||0)>now+30)throw new Error('OIDC_TIME_INVALID');
  if(payload.repository!==GH_REPOSITORY)throw new Error('OIDC_REPOSITORY_DENIED');
  if(payload.ref!==GH_REF)throw new Error('OIDC_REF_DENIED');
  if(payload.workflow_ref!==GH_WORKFLOW_REF)throw new Error('OIDC_WORKFLOW_DENIED');
  if(!GH_EVENTS.has(String(payload.event_name||'')))throw new Error('OIDC_EVENT_DENIED');
  return payload;
}

function validateShare(value:unknown){
  const raw=String(value||'').trim();
  if(raw.length<32||raw.length>3000)throw new Error('SHARE_URL_INVALID');
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.hostname!==ALLOWED_HOST||url.pathname!=='/')throw new Error('SHARE_URL_TARGET_DENIED');
  if(!url.searchParams.get('_vercel_share'))throw new Error('SHARE_TOKEN_MISSING');
  return url;
}
function redactString(value:unknown){return String(value??'').replace(/([?&]_vercel_share=)[^&\s"']+/gi,'$1[REDACTED]').slice(0,1000)}
function safeArray(value:unknown,limit=20){
  if(!Array.isArray(value))return [];
  return value.slice(0,limit).map((item:any)=>{
    if(item&&typeof item==='object'){
      const out:any={};
      for(const [key,val] of Object.entries(item)){
        if(['value','url','target','final_url'].includes(key))continue;
        out[key]=typeof val==='string'?redactString(val):val;
      }
      return out;
    }
    return redactString(item);
  });
}

async function callBrowser(payload:any){
  let result:any={};let status=0;
  try{
    const r=await fetch(BROWSER,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(65000)});
    status=r.status;
    result=await r.json().catch(()=>({ok:false,pass:false,error:'INVALID_JSON_RESPONSE'}));
  }catch(error){result={ok:false,pass:false,error:String(error)}}
  return {status,result};
}

async function protectedSmoke(req:Request){
  const claims=await verifyGitHubOidc(req);
  const {data:share,error:shareError}=await db.rpc('dabbir_qa_consume_protected_share');
  if(shareError||!share)return Response.json({ok:false,pass:false,error:'PROTECTED_SHARE_UNAVAILABLE'},{status:409,headers:{'cache-control':'no-store'}});
  let target:URL;
  try{target=validateShare(share)}catch(error){return Response.json({ok:false,pass:false,error:redactString(error instanceof Error?error.message:error)},{status:400,headers:{'cache-control':'no-store'}})}

  const actions=[
    {type:'wait',selector:'#authGate:not(.hidden)',timeout_ms:15000},
    {type:'assert_count',selector:'#authEmail',min:1,max:1},
    {type:'assert_count',selector:'#authPassword',min:1,max:1},
    {type:'assert_count',selector:'#authSubmit',min:1,max:1},
    {type:'assert_count',selector:'.brand .logo',min:1},
    {type:'assert_text',selector:'body',includes:'DABBIR'},
  ];
  const {status,result}=await callBrowser({url:target.href,mode:'owner_simulation',device:'iphone',deploymentId:null,artifactHash:null,baseline:null,actions});
  let finalHost='';try{finalHost=new URL(String(result?.final_url||'')).hostname}catch{}
  const targetReached=finalHost===ALLOWED_HOST;
  const pass=status===200&&result?.ok===true&&result?.pass===true&&targetReached;
  const safe:any={
    worker_status:status,
    target_reached:targetReached,
    final_host:finalHost||null,
    browser_http_status:Number(result?.http_status||0),
    title:redactString(result?.title||''),
    page:result?.page||null,
    actions:safeArray(result?.actions,30),
    network:result?.network||null,
    console_errors:safeArray(result?.console_errors),
    page_errors:safeArray(result?.page_errors),
    phase_errors:safeArray(result?.phase_errors),
    phase_warnings:safeArray(result?.phase_warnings),
    latency_ms:Number(result?.latency_ms||0),
  };
  const {data:runId,error:recordError}=await db.rpc('barman_record_browser_executor_run',{
    p_target_url:SAFE_TARGET,p_mode:'protected_owner_smoke',p_devices:['iphone'],p_deployment_id:null,p_artifact_hash:null,p_pass:pass,p_result:{source:'GITHUB_OIDC_ONE_TIME_VERCEL_SHARE_BROWSER_BRIDGE',github_run_id:claims?.run_id||null,...safe}
  });
  if(recordError)return Response.json({ok:false,pass:false,error:'QA_EVIDENCE_RECORD_FAILED'},{status:500,headers:{'cache-control':'no-store'}});
  return Response.json({ok:true,pass,source:'GITHUB_OIDC_ONE_TIME_VERCEL_SHARE_BROWSER_BRIDGE',run_id:runId,...safe},{headers:{'cache-control':'no-store'}});
}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return new Response('method not allowed',{status:405});
  const body=await req.json().catch(()=>({}));
  if(String(body?.action||'')===PROTECTED_ACTION){
    try{return await protectedSmoke(req)}catch(error){
      const message=redactString(error instanceof Error?error.message:error);
      const status=message.startsWith('OIDC_')?401:502;
      return Response.json({ok:false,pass:false,error:message},{status,headers:{'cache-control':'no-store'}});
    }
  }

  const supplied=req.headers.get('x-barman-worker-secret')||'';
  if(!supplied)return new Response('unauthorized',{status:401});
  const {data:valid}=await db.rpc('barman_validate_worker_secret',{p_secret:supplied});
  if(valid!==true)return new Response('unauthorized',{status:401});

  const {url,mode='smoke',device='desktop',deploymentId=null,artifactHash=null,baseline=null,actions=[]}=body;
  if(!url)return Response.json({ok:false,error:'url_required'},{status:400});
  if(!Array.isArray(actions))return Response.json({ok:false,error:'actions_must_be_array'},{status:400});

  const {status,result}=await callBrowser({url,mode,device,deploymentId,artifactHash,baseline,actions:actions.slice(0,30)});
  const pass=status===200&&result?.ok===true&&result?.pass===true;
  const {data:runId,error}=await db.rpc('barman_record_browser_executor_run',{
    p_target_url:url,
    p_mode:mode,
    p_devices:[device],
    p_deployment_id:deploymentId,
    p_artifact_hash:artifactHash,
    p_pass:pass,
    p_result:{http_status:status,...result}
  });
  if(error)return Response.json({ok:false,error:error.message,result},{status:500});
  return Response.json({ok:true,pass,run_id:runId,http_status:status,result});
});
