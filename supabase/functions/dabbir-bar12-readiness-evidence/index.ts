import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.112.2";

const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const GH_ISSUER='https://token.actions.githubusercontent.com';
const GH_AUDIENCE='dabbir-bar12-readiness';
const GH_REPOSITORY='barman-systems/pilot';
const GH_REF='refs/heads/main';
const GH_WORKFLOW_REF='barman-systems/pilot/.github/workflows/dabbir-bar12-readiness.yml@refs/heads/main';
const GH_EVENTS=new Set(['push','schedule','workflow_dispatch']);

function b64urlDecode(value:string){const padded=value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4);const binary=atob(padded);return Uint8Array.from(binary,c=>c.charCodeAt(0))}
function decodeJsonPart(value:string){return JSON.parse(new TextDecoder().decode(b64urlDecode(value)))}
async function verifyGitHubOidc(req:Request){
  const authHeader=req.headers.get('authorization')||'';if(!authHeader.startsWith('Bearer '))throw new Error('OIDC_REQUIRED');
  const token=authHeader.slice(7).trim(),parts=token.split('.');if(parts.length!==3)throw new Error('OIDC_FORMAT_INVALID');
  const header=decodeJsonPart(parts[0]),payload=decodeJsonPart(parts[1]);if(header?.alg!=='RS256'||!header?.kid)throw new Error('OIDC_ALG_INVALID');
  const jwksResponse=await fetch('https://token.actions.githubusercontent.com/.well-known/jwks',{headers:{accept:'application/json'},signal:AbortSignal.timeout(10000)});if(!jwksResponse.ok)throw new Error('OIDC_JWKS_UNAVAILABLE');
  const jwks=await jwksResponse.json(),jwk=(jwks?.keys||[]).find((key:any)=>key.kid===header.kid&&key.kty==='RSA');if(!jwk)throw new Error('OIDC_KEY_NOT_FOUND');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,b64urlDecode(parts[2]),new TextEncoder().encode(`${parts[0]}.${parts[1]}`));if(!valid)throw new Error('OIDC_SIGNATURE_INVALID');
  const now=Math.floor(Date.now()/1000);if(payload.iss!==GH_ISSUER)throw new Error('OIDC_ISSUER_DENIED');const audiences=Array.isArray(payload.aud)?payload.aud:[payload.aud];if(!audiences.includes(GH_AUDIENCE))throw new Error('OIDC_AUDIENCE_DENIED');
  if(Number(payload.exp||0)<=now||Number(payload.nbf||0)>now+30)throw new Error('OIDC_TIME_INVALID');if(payload.repository!==GH_REPOSITORY)throw new Error('OIDC_REPOSITORY_DENIED');if(payload.ref!==GH_REF)throw new Error('OIDC_REF_DENIED');if(payload.workflow_ref!==GH_WORKFLOW_REF)throw new Error('OIDC_WORKFLOW_DENIED');if(!GH_EVENTS.has(String(payload.event_name||'')))throw new Error('OIDC_EVENT_DENIED');return payload;
}
async function count(table:string,configure:(q:any)=>any){let q=db.from(table).select('*',{count:'exact',head:true});q=configure(q);const {count,error}=await q;if(error)throw new Error(`READINESS_QUERY_FAILED:${table}:${error.message}`);return Number(count||0)}

async function evidence(){
  const since=new Date(Date.now()-7*24*60*60*1000).toISOString();
  const {data:businesses,error:businessError}=await db.from('dabbir_businesses').select('id,created_at').eq('demo_mode',false);if(businessError)throw new Error(`READINESS_QUERY_FAILED:dabbir_businesses:${businessError.message}`);
  const businessIds=(businesses||[]).map((row:any)=>row.id);
  if(!businessIds.length)return {window_days:7,real_business_count:0,whatsapp:{connection_rows:0,operational_connections:0,verified_connections:0,inbound_conversations:0,inbound_messages:0,verified_replies:0,connection_success_rate:null,setup_time_seconds:null},operations:{records:0,verified_success:0,autonomous_verified_success:0,p95_ms:null},handoffs:{records:0,routed_to_human:0,rate:null},quality:{events:0,severe:0},satisfaction:{samples:0,score:null}};

  const {data:waConversations,error:waConvError}=await db.from('dabbir_conversations').select('id').in('business_id',businessIds).eq('demo_mode',false).eq('channel_type','whatsapp').gte('created_at',since).limit(10000);if(waConvError)throw new Error(`READINESS_QUERY_FAILED:dabbir_conversations:${waConvError.message}`);
  const waConversationIds=(waConversations||[]).map((r:any)=>r.id),inboundConversations=waConversationIds.length;
  const [connectionRows,operationalConnections,verifiedConnections,inboundMessages,operationRecords,verifiedSuccess,autonomousVerifiedSuccess,handoffRecords,routedToHuman,qualityEvents,severeQualityEvents]=await Promise.all([
    count('dabbir_whatsapp_connections',q=>q.in('business_id',businessIds)),count('dabbir_whatsapp_connections',q=>q.in('business_id',businessIds).in('status',['connected','operational','active'])),count('dabbir_whatsapp_connections',q=>q.in('business_id',businessIds).not('last_verified_at','is',null)),
    waConversationIds.length?count('dabbir_messages',q=>q.in('business_id',businessIds).in('conversation_id',waConversationIds).eq('simulated',false).eq('sender_type','customer').gte('created_at',since)):Promise.resolve(0),
    count('dabbir_operation_outcomes',q=>q.in('business_id',businessIds).gte('created_at',since)),count('dabbir_operation_outcomes',q=>q.in('business_id',businessIds).eq('outcome','VERIFIED_SUCCESS').gte('created_at',since)),count('dabbir_operation_outcomes',q=>q.in('business_id',businessIds).eq('outcome','VERIFIED_SUCCESS').eq('autonomous',true).gte('created_at',since)),
    count('dabbir_handoffs',q=>q.in('business_id',businessIds).gte('created_at',since)),count('dabbir_handoffs',q=>q.in('business_id',businessIds).not('assigned_at','is',null).gte('created_at',since)),count('dabbir_quality_events',q=>q.in('business_id',businessIds).gte('created_at',since)),count('dabbir_quality_events',q=>q.in('business_id',businessIds).in('severity',['HIGH','CRITICAL','ERROR','FATAL','high','critical','error','fatal']).gte('created_at',since)),
  ]);
  const {data:operationDurations,error:durationError}=await db.from('dabbir_operation_outcomes').select('duration_ms').in('business_id',businessIds).not('duration_ms','is',null).gte('created_at',since).order('duration_ms',{ascending:true}).limit(10000);if(durationError)throw new Error(`READINESS_QUERY_FAILED:dabbir_operation_outcomes:${durationError.message}`);const durations=(operationDurations||[]).map((r:any)=>Number(r.duration_ms)).filter(Number.isFinite);const p95=durations.length?durations[Math.min(durations.length-1,Math.ceil(durations.length*.95)-1)]:null;
  const verifiedReplies=waConversationIds.length?await count('dabbir_conversation_outcomes',q=>q.in('business_id',businessIds).in('conversation_id',waConversationIds).eq('verified_external_result',true).gte('created_at',since)):0;
  const {data:connections,error:connectionsError}=await db.from('dabbir_whatsapp_connections').select('business_id,connected_at,last_verified_at').in('business_id',businessIds).not('connected_at','is',null).limit(10000);if(connectionsError)throw new Error(`READINESS_QUERY_FAILED:dabbir_whatsapp_connections:${connectionsError.message}`);const businessCreated=new Map((businesses||[]).map((r:any)=>[String(r.id),new Date(r.created_at).getTime()]));const setupSamples=(connections||[]).map((r:any)=>Math.max(0,(new Date(r.connected_at).getTime()-(businessCreated.get(String(r.business_id))||new Date(r.connected_at).getTime()))/1000)).filter(Number.isFinite);const setupTimeSeconds=setupSamples.length?Math.round(setupSamples.reduce((a:number,b:number)=>a+b,0)/setupSamples.length):null;
  return {window_days:7,real_business_count:businessIds.length,whatsapp:{connection_rows:connectionRows,operational_connections:operationalConnections,verified_connections:verifiedConnections,inbound_conversations:inboundConversations,inbound_messages:inboundMessages,verified_replies:verifiedReplies,connection_success_rate:null,setup_time_seconds:setupTimeSeconds},operations:{records:operationRecords,verified_success:verifiedSuccess,autonomous_verified_success:autonomousVerifiedSuccess,p95_ms:p95},handoffs:{records:handoffRecords,routed_to_human:routedToHuman,rate:inboundConversations>0?routedToHuman/inboundConversations:null},quality:{events:qualityEvents,severe:severeQualityEvents},satisfaction:{samples:0,score:null}};
}
Deno.serve(async(req:Request)=>{if(req.method!=='POST')return Response.json({ok:false,error:'METHOD_NOT_ALLOWED'},{status:405,headers:{allow:'POST','cache-control':'no-store'}});try{const claims=await verifyGitHubOidc(req),data=await evidence();return Response.json({ok:true,generated_at:new Date().toISOString(),github_run_id:claims.run_id||null,evidence:data},{headers:{'cache-control':'no-store'}})}catch(e){const message=String(e instanceof Error?e.message:e).slice(0,500),authFailure=message.startsWith('OIDC_');return Response.json({ok:false,error:message},{status:authFailure?401:500,headers:{'cache-control':'no-store'}})}});
