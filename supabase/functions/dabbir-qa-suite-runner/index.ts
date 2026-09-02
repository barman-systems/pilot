import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.112.2";

const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const GH_ISSUER='https://token.actions.githubusercontent.com';
const GH_REPOSITORY='barman-systems/pilot';
const GH_REF='refs/heads/main';
const GH_WORKFLOW='barman-systems/pilot/.github/workflows/dabbir-ai-customer-journey.yml@refs/heads/main';
const GH_AUDIENCE='dabbir-ai-qa';
const GH_EVENTS=new Set(['push','schedule','workflow_dispatch']);
const ACTIONS=new Set(['dabbir_ai_qa_bootstrap','dabbir_ai_qa_seed_order','dabbir_ai_qa_cleanup']);

function b64urlDecode(value:string){const padded=value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4);const binary=atob(padded);return Uint8Array.from(binary,c=>c.charCodeAt(0))}
function decodeJsonPart(value:string){return JSON.parse(new TextDecoder().decode(b64urlDecode(value)))}
async function verifyGitHubOidc(req:Request){
  const auth=req.headers.get('authorization')||'';
  if(!auth.startsWith('Bearer '))throw new Error('OIDC_REQUIRED');
  const token=auth.slice(7).trim(),parts=token.split('.');
  if(parts.length!==3)throw new Error('OIDC_FORMAT_INVALID');
  const header=decodeJsonPart(parts[0]),payload=decodeJsonPart(parts[1]);
  if(header?.alg!=='RS256'||!header?.kid)throw new Error('OIDC_ALG_INVALID');
  const jwksResponse=await fetch('https://token.actions.githubusercontent.com/.well-known/jwks',{headers:{accept:'application/json'},signal:AbortSignal.timeout(10000)});
  if(!jwksResponse.ok)throw new Error('OIDC_JWKS_UNAVAILABLE');
  const jwks=await jwksResponse.json(),jwk=(jwks?.keys||[]).find((k:any)=>k.kid===header.kid&&k.kty==='RSA');
  if(!jwk)throw new Error('OIDC_KEY_NOT_FOUND');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,b64urlDecode(parts[2]),new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if(!valid)throw new Error('OIDC_SIGNATURE_INVALID');
  const now=Math.floor(Date.now()/1000),aud=Array.isArray(payload.aud)?payload.aud:[payload.aud];
  if(payload.iss!==GH_ISSUER)throw new Error('OIDC_ISSUER_DENIED');
  if(!aud.includes(GH_AUDIENCE))throw new Error('OIDC_AUDIENCE_DENIED');
  if(Number(payload.exp||0)<=now||Number(payload.nbf||0)>now+30)throw new Error('OIDC_TIME_INVALID');
  if(payload.repository!==GH_REPOSITORY||payload.ref!==GH_REF||payload.workflow_ref!==GH_WORKFLOW)throw new Error('OIDC_SOURCE_DENIED');
  if(!GH_EVENTS.has(String(payload.event_name||'')))throw new Error('OIDC_EVENT_DENIED');
  return payload;
}
function runId(value:any){const v=String(value||'').trim();if(!/^[A-Za-z0-9-]{6,90}$/.test(v))throw new Error('INVALID_RUN_ID');return v}
function password(){const bytes=crypto.getRandomValues(new Uint8Array(24));const base=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');return `Dabbir-QA-${base}!Aa9`}
async function createUser(email:string,pw:string,rid:string,label:string){const {data,error}=await db.auth.admin.createUser({email,password:pw,email_confirm:true,user_metadata:{dabbir_qa:true,dabbir_qa_run_id:rid,role_label:label}});if(error||!data?.user?.id)throw new Error(`AUTH_USER_CREATE_FAILED:${error?.message||'missing_id'}`);return {id:data.user.id,email,password:pw}}
async function scopedUser(id:string,rid:string){const {data,error}=await db.auth.admin.getUserById(id);if(error||!data?.user||data.user.user_metadata?.dabbir_qa!==true||data.user.user_metadata?.dabbir_qa_run_id!==rid)throw new Error('QA_USER_SCOPE_DENIED')}
async function deleteUser(id:string,rid:string){await scopedUser(id,rid);const {error:t}=await db.from('account_access_state').upsert({user_id:id,status:'deleted',reason:'DABBIR_QA_CLEANUP',updated_at:new Date().toISOString()},{onConflict:'user_id'});if(t)throw new Error(`QA_USER_TOMBSTONE_FAILED:${t.message}`);const {error:a}=await db.from('dabbir_user_accounts').delete().eq('user_id',id);if(a)throw new Error(`QA_USER_ACCOUNT_DELETE_FAILED:${a.message}`);const {error}=await db.auth.admin.deleteUser(id);if(error)throw new Error(`AUTH_USER_DELETE_FAILED:${error.message}`);return {deleted:true,user_id:id}}
async function assertBusiness(id:string,rid:string){const {data,error}=await db.from('dabbir_businesses').select('id,name').eq('id',id).maybeSingle();if(error||!data||data.name!==`DABBIR AI QA ${rid}`)throw new Error('QA_BUSINESS_SCOPE_DENIED')}
async function bootstrap(rid:string){const suffix=`${rid.toLowerCase()}-${crypto.randomUUID().slice(0,8)}`;let owner:any=null,employee:any=null;try{owner=await createUser(`dabbir-qa-owner-${suffix}@example.com`,password(),rid,'owner');employee=await createUser(`dabbir-qa-employee-${suffix}@example.com`,password(),rid,'employee');return {owner,employee}}catch(e){if(employee?.id)await deleteUser(employee.id,rid).catch(()=>{});if(owner?.id)await deleteUser(owner.id,rid).catch(()=>{});throw e}}
async function cleanup(rid:string,b:any){const out:any={};if(b.business_id){await assertBusiness(String(b.business_id),rid);const {data,error}=await db.rpc('dabbir_qa_cleanup_business',{p_business_id:String(b.business_id)});if(error)throw new Error(`QA_BUSINESS_CLEANUP_FAILED:${error.message}`);out.business=data}if(b.employee_user_id)out.employee=await deleteUser(String(b.employee_user_id),rid);if(b.owner_user_id)out.owner=await deleteUser(String(b.owner_user_id),rid);return out}
function errorResponse(e:unknown){const m=String(e instanceof Error?e.message:e).slice(0,500);return Response.json({ok:false,error:m},{status:m.startsWith('OIDC_')?401:400,headers:{'cache-control':'no-store'}})}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return new Response('method not allowed',{status:405});
  try{
    const claims=await verifyGitHubOidc(req);
    const b=await req.json().catch(()=>({})),action=String(b.action||''),rid=runId(b.run_id);
    if(!ACTIONS.has(action))return Response.json({ok:false,error:'unknown_action'},{status:400});
    if(action==='dabbir_ai_qa_bootstrap')return Response.json({ok:true,action,run_id:rid,identities:await bootstrap(rid),github_run_id:claims.run_id||null},{headers:{'cache-control':'no-store'}});
    if(action==='dabbir_ai_qa_seed_order'){
      const businessId=String(b.business_id||''),customerId=String(b.customer_id||'');
      if(!businessId||!customerId)return Response.json({ok:false,error:'business_id_customer_id_required'},{status:400});
      await assertBusiness(businessId,rid);
      const {data,error}=await db.from('dabbir_orders').insert({business_id:businessId,customer_id:customerId,status:'draft',total_aed:125,simulated:false}).select('id,status,total_aed,simulated').single();
      if(error||!data?.id)throw new Error(`QA_ORDER_CREATE_FAILED:${error?.message||'missing_id'}`);
      return Response.json({ok:true,action,run_id:rid,order:data},{headers:{'cache-control':'no-store'}});
    }
    return Response.json({ok:true,action,run_id:rid,cleanup:await cleanup(rid,b)},{headers:{'cache-control':'no-store'}});
  }catch(e){return errorResponse(e)}
});
