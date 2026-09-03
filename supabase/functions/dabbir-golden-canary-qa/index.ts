import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.112.2";

const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const GH_ISSUER='https://token.actions.githubusercontent.com';
const GH_REPOSITORY='barman-systems/pilot';
const GH_REF='refs/heads/main';
const GH_EVENTS=new Set(['workflow_dispatch','issue_comment']);
const GH_COMMENT_ACTOR='barmanai';
const GH_COMMENT_ACTOR_ID='319216860';
const GH_WORKFLOW_REF='barman-systems/pilot/.github/workflows/dabbir-golden-canary.yml@refs/heads/main';
const OIDC_AUDIENCE='dabbir-ai-qa';
const ACTIONS=new Set(['dabbir_ai_qa_bootstrap','dabbir_ai_qa_seed_order','dabbir_ai_qa_cleanup']);

function b64urlDecode(value:string){const padded=value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4);const binary=atob(padded);return Uint8Array.from(binary,c=>c.charCodeAt(0))}
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
  const now=Math.floor(Date.now()/1000),audiences=Array.isArray(payload.aud)?payload.aud:[payload.aud];
  if(payload.iss!==GH_ISSUER)throw new Error('OIDC_ISSUER_DENIED');
  if(!audiences.includes(OIDC_AUDIENCE))throw new Error('OIDC_AUDIENCE_DENIED');
  if(Number(payload.exp||0)<=now||Number(payload.nbf||0)>now+30)throw new Error('OIDC_TIME_INVALID');
  if(payload.repository!==GH_REPOSITORY)throw new Error('OIDC_REPOSITORY_DENIED');
  if(payload.ref!==GH_REF)throw new Error('OIDC_REF_DENIED');
  if(payload.workflow_ref!==GH_WORKFLOW_REF)throw new Error('OIDC_WORKFLOW_DENIED');
  if(!GH_EVENTS.has(String(payload.event_name||'')))throw new Error('OIDC_EVENT_DENIED');
  if(payload.event_name==='issue_comment'){
    if(payload.actor!==GH_COMMENT_ACTOR||String(payload.actor_id||'')!==GH_COMMENT_ACTOR_ID)throw new Error('OIDC_COMMENT_ACTOR_DENIED');
  }
  return payload;
}

function validRunId(value:any){const runId=String(value||'').trim();if(!/^[A-Za-z0-9-]{6,90}$/.test(runId))throw new Error('INVALID_RUN_ID');return runId}
function randomPassword(){const bytes=crypto.getRandomValues(new Uint8Array(24));const base=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');return `Dabbir-QA-${base}!Aa9`}

async function createQaUser(email:string,password:string,runId:string,label:string){
  const {data,error}=await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{dabbir_qa:true,dabbir_qa_run_id:runId,role_label:label}});
  if(error||!data?.user?.id)throw new Error(`AUTH_USER_CREATE_FAILED:${error?.message||'missing_id'}`);
  return {id:data.user.id,email,password};
}
async function getQaUser(userId:string,runId:string){
  const {data,error}=await db.auth.admin.getUserById(userId);
  if(error||!data?.user)throw new Error(`AUTH_USER_LOOKUP_FAILED:${error?.message||'missing_user'}`);
  if(data.user.user_metadata?.dabbir_qa!==true||data.user.user_metadata?.dabbir_qa_run_id!==runId)throw new Error('QA_USER_SCOPE_DENIED');
  return data.user;
}
async function deleteQaUser(userId:string,runId:string){
  await getQaUser(userId,runId);
  const {error:tombstoneError}=await db.from('account_access_state').upsert({user_id:userId,status:'deleted',reason:'DABBIR_GOLDEN_CANARY_QA_CLEANUP',updated_at:new Date().toISOString()},{onConflict:'user_id'});
  if(tombstoneError)throw new Error(`QA_USER_TOMBSTONE_FAILED:${tombstoneError.message}`);
  const {error:accountError}=await db.from('dabbir_user_accounts').delete().eq('user_id',userId);
  if(accountError)throw new Error(`QA_USER_ACCOUNT_DELETE_FAILED:${accountError.message}`);
  const {error}=await db.auth.admin.deleteUser(userId);
  if(error)throw new Error(`AUTH_USER_DELETE_FAILED:${error.message}`);
  return {deleted:true,user_id:userId};
}
async function assertQaBusiness(businessId:string,runId:string){
  const {data,error}=await db.from('dabbir_businesses').select('id,name,owner_id').eq('id',businessId).maybeSingle();
  if(error)throw new Error(`QA_BUSINESS_LOOKUP_FAILED:${error.message}`);
  if(!data||data.name!==`DABBIR AI QA ${runId}`)throw new Error('QA_BUSINESS_SCOPE_DENIED');
  return data;
}
async function bootstrap(runId:string){
  const suffix=`${runId.toLowerCase()}-${crypto.randomUUID().slice(0,8)}`;let owner:any=null,employee:any=null;
  try{owner=await createQaUser(`dabbir-qa-owner-${suffix}@example.com`,randomPassword(),runId,'owner');employee=await createQaUser(`dabbir-qa-employee-${suffix}@example.com`,randomPassword(),runId,'employee');return {owner,employee}}
  catch(error){if(employee?.id)await deleteQaUser(employee.id,runId).catch(()=>{});if(owner?.id)await deleteQaUser(owner.id,runId).catch(()=>{});throw error}
}
async function seedOrder(runId:string,businessId:string,customerId:string){
  await assertQaBusiness(businessId,runId);
  const {data,error}=await db.from('dabbir_orders').insert({business_id:businessId,customer_id:customerId,status:'draft',total_aed:125,simulated:false}).select('id,status,total_aed,simulated').single();
  if(error||!data?.id)throw new Error(`QA_ORDER_CREATE_FAILED:${error?.message||'missing_id'}`);
  return data;
}
async function cleanup(runId:string,businessId:string|null,ownerUserId:string|null,employeeUserId:string|null){
  const result:any={};
  if(businessId){await assertQaBusiness(businessId,runId);const {data,error}=await db.rpc('dabbir_qa_cleanup_business',{p_business_id:businessId});if(error)throw new Error(`QA_BUSINESS_CLEANUP_FAILED:${error.message}`);result.business=data}
  if(employeeUserId)result.employee=await deleteQaUser(employeeUserId,runId);
  if(ownerUserId)result.owner=await deleteQaUser(ownerUserId,runId);
  return result;
}
function failure(error:unknown,status=400){const message=String(error instanceof Error?error.message:error).slice(0,500);return Response.json({ok:false,error:message},{status:message.startsWith('OIDC_')?401:status,headers:{'cache-control':'no-store'}})}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return new Response('method not allowed',{status:405});
  const body=await req.json().catch(()=>({})),action=String(body.action||'');
  if(!ACTIONS.has(action))return Response.json({ok:false,error:'unknown_action'},{status:400});
  try{
    const claims=await verifyGitHubOidc(req),runId=validRunId(body.run_id);
    if(action==='dabbir_ai_qa_bootstrap')return Response.json({ok:true,action,run_id:runId,identities:await bootstrap(runId),github_run_id:claims.run_id||null},{headers:{'cache-control':'no-store'}});
    if(action==='dabbir_ai_qa_seed_order'){
      const businessId=String(body.business_id||''),customerId=String(body.customer_id||'');
      if(!businessId||!customerId)return Response.json({ok:false,error:'business_id_customer_id_required'},{status:400});
      return Response.json({ok:true,action,run_id:runId,order:await seedOrder(runId,businessId,customerId)},{headers:{'cache-control':'no-store'}});
    }
    return Response.json({ok:true,action,run_id:runId,cleanup:await cleanup(runId,body.business_id?String(body.business_id):null,body.owner_user_id?String(body.owner_user_id):null,body.employee_user_id?String(body.employee_user_id):null)},{headers:{'cache-control':'no-store'}});
  }catch(error){return failure(error,500)}
});
