import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.112.2";

const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const BROWSER='https://barman-browser-worker.vercel.app/api/qa';
const WEB_TESTS=[['device_iphone','device_matrix','iphone'],['device_ipad','device_matrix','ipad'],['device_android','device_matrix','android'],['device_desktop','device_matrix','desktop'],['owner_iphone','owner_simulation','iphone'],['adversarial_desktop','adversarial','desktop'],['visual_desktop','visual_regression','desktop']] as const;
const DABBIR_QA_ACTIONS=new Set(['dabbir_ai_qa_bootstrap','dabbir_ai_qa_seed_order','dabbir_ai_qa_cleanup']);
const READINESS_ACTION='dabbir_bar12_readiness';
const GH_ISSUER='https://token.actions.githubusercontent.com';
const GH_REPOSITORY='barman-systems/pilot';
const GH_REF='refs/heads/main';
const GH_EVENTS=new Set(['push','schedule','workflow_dispatch']);
const OIDC_PROFILES={
  ai:{audience:'dabbir-ai-qa',workflowRefs:new Set(['barman-systems/pilot/.github/workflows/dabbir-ai-customer-journey.yml@refs/heads/main','barman-systems/pilot/.github/workflows/dabbir-owner-away-production.yml@refs/heads/main'])},
  readiness:{audience:'dabbir-bar12-readiness',workflowRef:'barman-systems/pilot/.github/workflows/dabbir-bar12-readiness.yml@refs/heads/main'},
} as const;

async function auth(req:Request){const s=req.headers.get('x-barman-worker-secret')||'';if(!s)return false;const {data}=await db.rpc('barman_validate_worker_secret',{p_secret:s});return data===true}
function targetReached(target:string,result:any){try{const t=new URL(target),f=new URL(String(result?.final_url||''));if(f.hostname==='vercel.com'&&f.pathname.startsWith('/login'))return false;if(String(result?.title||'').toLowerCase().includes('login')&&f.hostname==='vercel.com')return false;return f.hostname===t.hostname}catch{return false}}
async function browserTest(url:string,mode:string,device:string,deploymentId:string,artifactHash:string,baseline:string|null){try{const r=await fetch(BROWSER,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url,mode,device,deploymentId,artifactHash,baseline:mode==='visual_regression'?baseline:null}),signal:AbortSignal.timeout(60000)});const data=await r.json().catch(()=>({ok:false,pass:false,error:'INVALID_JSON'}));const reached=targetReached(url,data);return {http_status:r.status,...data,target_reached:reached,raw_worker_pass:data?.pass===true,pass:data?.pass===true&&reached===true}}catch(e){return {ok:false,pass:false,error:String(e),http_status:0,target_reached:false}}}
async function apiProbe(url:string){try{const u=new URL(url);if(!['http:','https:'].includes(u.protocol))return {ok:false,status:0,error:'unsupported_scheme'};const r=await fetch(u,{method:'GET',redirect:'follow',signal:AbortSignal.timeout(15000)});const contentType=r.headers.get('content-type')||'',text=await r.text();return {ok:r.ok,status:r.status,final_url:r.url,content_type:contentType,body_bytes:new TextEncoder().encode(text).length,https:new URL(r.url).protocol==='https:'}}catch(e){return {ok:false,status:0,error:String(e),content_type:'',body_bytes:0,https:false}}}
async function record(suiteId:number,key:string,mode:string,device:string,pass:boolean,result:any){const {error}=await db.rpc('barman_record_qa_suite_result',{p_suite_id:suiteId,p_test_key:key,p_mode:mode,p_device:device,p_pass:pass,p_result:result});return error?.message||null}

function b64urlDecode(value:string){const padded=value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4);const binary=atob(padded);return Uint8Array.from(binary,c=>c.charCodeAt(0))}
function decodeJsonPart(value:string){return JSON.parse(new TextDecoder().decode(b64urlDecode(value)))}
async function verifyGitHubOidc(req:Request,profile:keyof typeof OIDC_PROFILES){
  const expected=OIDC_PROFILES[profile];
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
  if(!audiences.includes(expected.audience))throw new Error('OIDC_AUDIENCE_DENIED');
  if(Number(payload.exp||0)<=now||Number(payload.nbf||0)>now+30)throw new Error('OIDC_TIME_INVALID');
  if(payload.repository!==GH_REPOSITORY)throw new Error('OIDC_REPOSITORY_DENIED');
  if(payload.ref!==GH_REF)throw new Error('OIDC_REF_DENIED');
  if('workflowRefs' in expected?!expected.workflowRefs.has(String(payload.workflow_ref||'')):payload.workflow_ref!==expected.workflowRef)throw new Error('OIDC_WORKFLOW_DENIED');
  if(!GH_EVENTS.has(String(payload.event_name||'')))throw new Error('OIDC_EVENT_DENIED');
  return payload;
}

function validRunId(value:any){const runId=String(value||'').trim();if(!/^[A-Za-z0-9-]{6,90}$/.test(runId))throw new Error('INVALID_RUN_ID');return runId}
function randomPassword(){const bytes=crypto.getRandomValues(new Uint8Array(24));const base=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');return `Dabbir-QA-${base}!Aa9`}
async function createQaUser(email:string,password:string,runId:string,label:string){const {data,error}=await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{dabbir_qa:true,dabbir_qa_run_id:runId,role_label:label}});if(error||!data?.user?.id)throw new Error(`AUTH_USER_CREATE_FAILED:${error?.message||'missing_id'}`);return {id:data.user.id,email,password}}
async function getQaUser(userId:string,runId:string){const {data,error}=await db.auth.admin.getUserById(userId);if(error||!data?.user)throw new Error(`AUTH_USER_LOOKUP_FAILED:${error?.message||'missing_user'}`);if(data.user.user_metadata?.dabbir_qa!==true||data.user.user_metadata?.dabbir_qa_run_id!==runId)throw new Error('QA_USER_SCOPE_DENIED');return data.user}
async function deleteQaUser(userId:string,runId:string){await getQaUser(userId,runId);const {error:tombstoneError}=await db.from('account_access_state').upsert({user_id:userId,status:'deleted',reason:'DABBIR_QA_CLEANUP',updated_at:new Date().toISOString()},{onConflict:'user_id'});if(tombstoneError)throw new Error(`QA_USER_TOMBSTONE_FAILED:${tombstoneError.message}`);const {error:accountError}=await db.from('dabbir_user_accounts').delete().eq('user_id',userId);if(accountError)throw new Error(`QA_USER_ACCOUNT_DELETE_FAILED:${accountError.message}`);const {error}=await db.auth.admin.deleteUser(userId);if(error)throw new Error(`AUTH_USER_DELETE_FAILED:${error.message}`);return {deleted:true,user_id:userId}}
async function assertQaBusiness(businessId:string,runId:string){const {data,error}=await db.from('dabbir_businesses').select('id,name,owner_id').eq('id',businessId).maybeSingle();if(error)throw new Error(`QA_BUSINESS_LOOKUP_FAILED:${error.message}`);if(!data||data.name!==`DABBIR AI QA ${runId}`)throw new Error('QA_BUSINESS_SCOPE_DENIED');return data}
async function dabbirBootstrap(runId:string){const suffix=`${runId.toLowerCase()}-${crypto.randomUUID().slice(0,8)}`;let owner:any=null,employee:any=null;try{owner=await createQaUser(`dabbir-qa-owner-${suffix}@example.com`,randomPassword(),runId,'owner');employee=await createQaUser(`dabbir-qa-employee-${suffix}@example.com`,randomPassword(),runId,'employee');return {owner,employee}}catch(e){if(employee?.id)await deleteQaUser(employee.id,runId).catch(()=>{});if(owner?.id)await deleteQaUser(owner.id,runId).catch(()=>{});throw e}}
async function dabbirSeedOrder(runId:string,businessId:string,customerId:string){await assertQaBusiness(businessId,runId);const {data,error}=await db.from('dabbir_orders').insert({business_id:businessId,customer_id:customerId,status:'draft',total_aed:125,simulated:false}).select('id,status,total_aed,simulated').single();if(error||!data?.id)throw new Error(`QA_ORDER_CREATE_FAILED:${error?.message||'missing_id'}`);return data}
async function dabbirCleanup(runId:string,businessId:string|null,ownerUserId:string|null,employeeUserId:string|null){const result:any={};if(businessId){await assertQaBusiness(businessId,runId);const {data,error}=await db.rpc('dabbir_qa_cleanup_business',{p_business_id:businessId});if(error)throw new Error(`QA_BUSINESS_CLEANUP_FAILED:${error.message}`);result.business=data}if(employeeUserId)result.employee=await deleteQaUser(employeeUserId,runId);if(ownerUserId)result.owner=await deleteQaUser(ownerUserId,runId);return result}
async function handleDabbirQa(req:Request,b:any,action:string){const claims=await verifyGitHubOidc(req,'ai');const runId=validRunId(b.run_id);if(action==='dabbir_ai_qa_bootstrap'){const identities=await dabbirBootstrap(runId);return Response.json({ok:true,action,run_id:runId,identities,github_run_id:claims.run_id||null},{headers:{'cache-control':'no-store'}})}if(action==='dabbir_ai_qa_seed_order'){const businessId=String(b.business_id||''),customerId=String(b.customer_id||'');if(!businessId||!customerId)return Response.json({ok:false,error:'business_id_customer_id_required'},{status:400});const order=await dabbirSeedOrder(runId,businessId,customerId);return Response.json({ok:true,action,run_id:runId,order},{headers:{'cache-control':'no-store'}})}if(action==='dabbir_ai_qa_cleanup'){const cleanup=await dabbirCleanup(runId,b.business_id?String(b.business_id):null,b.owner_user_id?String(b.owner_user_id):null,b.employee_user_id?String(b.employee_user_id):null);return Response.json({ok:true,action,run_id:runId,cleanup},{headers:{'cache-control':'no-store'}})}return Response.json({ok:false,error:'unknown_dabbir_qa_action'},{status:400})}

async function exactCount(table:string,configure:(q:any)=>any){let q=db.from(table).select('*',{count:'exact',head:true});q=configure(q);const {count,error}=await q;if(error)throw new Error(`READINESS_QUERY_FAILED:${table}:${error.message}`);return Number(count||0)}
async function readinessEvidence(){
  const since=new Date(Date.now()-7*24*60*60*1000).toISOString();
  const {data:businesses,error:businessError}=await db.from('dabbir_businesses').select('id,created_at').eq('demo_mode',false);
  if(businessError)throw new Error(`READINESS_QUERY_FAILED:dabbir_businesses:${businessError.message}`);
  const businessIds=(businesses||[]).map((row:any)=>row.id);
  if(!businessIds.length)return {window_days:7,real_business_count:0,whatsapp:{connection_rows:0,operational_connections:0,verified_connections:0,inbound_conversations:0,inbound_messages:0,verified_replies:0,connection_success_rate:null,setup_time_seconds:null},operations:{records:0,verified_success:0,autonomous_verified_success:0,p95_ms:null},handoffs:{records:0,routed_to_human:0,rate:null},quality:{events:0,severe:0},satisfaction:{samples:0,score:null}};

  const {data:waConversations,error:waConvError}=await db.from('dabbir_conversations').select('id').in('business_id',businessIds).eq('demo_mode',false).eq('channel_type','whatsapp').gte('created_at',since).limit(10000);
  if(waConvError)throw new Error(`READINESS_QUERY_FAILED:dabbir_conversations:${waConvError.message}`);
  const waConversationIds=(waConversations||[]).map((row:any)=>row.id),inboundConversations=waConversationIds.length;
  const [connectionRows,operationalConnections,verifiedConnections,inboundMessages,operationRecords,verifiedSuccess,autonomousVerifiedSuccess,handoffRecords,routedToHuman,qualityEvents,severeQualityEvents]=await Promise.all([
    exactCount('dabbir_whatsapp_connections',q=>q.in('business_id',businessIds)),
    exactCount('dabbir_whatsapp_connections',q=>q.in('business_id',businessIds).in('status',['connected','operational','active'])),
    exactCount('dabbir_whatsapp_connections',q=>q.in('business_id',businessIds).not('last_verified_at','is',null)),
    waConversationIds.length?exactCount('dabbir_messages',q=>q.in('business_id',businessIds).in('conversation_id',waConversationIds).eq('simulated',false).eq('sender_type','customer').gte('created_at',since)):Promise.resolve(0),
    exactCount('dabbir_operation_outcomes',q=>q.in('business_id',businessIds).gte('created_at',since)),
    exactCount('dabbir_operation_outcomes',q=>q.in('business_id',businessIds).eq('outcome','VERIFIED_SUCCESS').gte('created_at',since)),
    exactCount('dabbir_operation_outcomes',q=>q.in('business_id',businessIds).eq('outcome','VERIFIED_SUCCESS').eq('autonomous',true).gte('created_at',since)),
    exactCount('dabbir_handoffs',q=>q.in('business_id',businessIds).gte('created_at',since)),
    exactCount('dabbir_handoffs',q=>q.in('business_id',businessIds).not('assigned_at','is',null).gte('created_at',since)),
    exactCount('dabbir_quality_events',q=>q.in('business_id',businessIds).gte('created_at',since)),
    exactCount('dabbir_quality_events',q=>q.in('business_id',businessIds).in('severity',['HIGH','CRITICAL','ERROR','FATAL','high','critical','error','fatal']).gte('created_at',since)),
  ]);
  const {data:operationDurations,error:durationError}=await db.from('dabbir_operation_outcomes').select('duration_ms').in('business_id',businessIds).not('duration_ms','is',null).gte('created_at',since).order('duration_ms',{ascending:true}).limit(10000);
  if(durationError)throw new Error(`READINESS_QUERY_FAILED:dabbir_operation_outcomes:${durationError.message}`);
  const durations=(operationDurations||[]).map((row:any)=>Number(row.duration_ms)).filter(Number.isFinite);
  const p95=durations.length?durations[Math.min(durations.length-1,Math.ceil(durations.length*.95)-1)]:null;
  const verifiedReplies=waConversationIds.length?await exactCount('dabbir_conversation_outcomes',q=>q.in('business_id',businessIds).in('conversation_id',waConversationIds).eq('verified_external_result',true).gte('created_at',since)):0;
  const {data:connections,error:connectionsError}=await db.from('dabbir_whatsapp_connections').select('business_id,connected_at,last_verified_at').in('business_id',businessIds).not('connected_at','is',null).limit(10000);
  if(connectionsError)throw new Error(`READINESS_QUERY_FAILED:dabbir_whatsapp_connections:${connectionsError.message}`);
  const businessCreated=new Map((businesses||[]).map((row:any)=>[String(row.id),new Date(row.created_at).getTime()]));
  const setupSamples=(connections||[]).map((row:any)=>Math.max(0,(new Date(row.connected_at).getTime()-(businessCreated.get(String(row.business_id))||new Date(row.connected_at).getTime()))/1000)).filter(Number.isFinite);
  const setupTimeSeconds=setupSamples.length?Math.round(setupSamples.reduce((a:number,b:number)=>a+b,0)/setupSamples.length):null;
  return {window_days:7,real_business_count:businessIds.length,whatsapp:{connection_rows:connectionRows,operational_connections:operationalConnections,verified_connections:verifiedConnections,inbound_conversations:inboundConversations,inbound_messages:inboundMessages,verified_replies:verifiedReplies,connection_success_rate:null,setup_time_seconds:setupTimeSeconds},operations:{records:operationRecords,verified_success:verifiedSuccess,autonomous_verified_success:autonomousVerifiedSuccess,p95_ms:p95},handoffs:{records:handoffRecords,routed_to_human:routedToHuman,rate:inboundConversations>0?routedToHuman/inboundConversations:null},quality:{events:qualityEvents,severe:severeQualityEvents},satisfaction:{samples:0,score:null}};
}
async function handleReadiness(req:Request){const claims=await verifyGitHubOidc(req,'readiness');const evidence=await readinessEvidence();return Response.json({ok:true,action:READINESS_ACTION,generated_at:new Date().toISOString(),github_run_id:claims.run_id||null,evidence},{headers:{'cache-control':'no-store'}})}
function actionError(error:unknown,defaultStatus:number){const message=String(error instanceof Error?error.message:error).slice(0,500);const authFailure=message.startsWith('OIDC_');return Response.json({ok:false,error:message},{status:authFailure?401:defaultStatus,headers:{'cache-control':'no-store'}})}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return new Response('method not allowed',{status:405});
  const b=await req.json().catch(()=>({}));
  const action=String(b.action||'');
  if(action===READINESS_ACTION){try{return await handleReadiness(req)}catch(e){return actionError(e,500)}}
  if(DABBIR_QA_ACTIONS.has(action)){try{return await handleDabbirQa(req,b,action)}catch(e){return actionError(e,400)}}
  if(!(await auth(req)))return new Response('unauthorized',{status:401});
  const projectName=String(b.projectName||'bm-service'),url=String(b.url||''),deploymentId=String(b.deploymentId||''),artifactHash=String(b.artifactHash||''),baseline=b.baseline?String(b.baseline):null,profile=String(b.profile||b.artifactType||'web_ui')==='backend_api'?'backend_api':'web_ui';
  if(!url||!deploymentId||!artifactHash)return Response.json({ok:false,error:'url_deploymentId_artifactHash_required'},{status:400});
  const {data:suiteId,error:createErr}=await db.rpc('barman_create_qa_suite_v2',{p_project_name:projectName,p_target_url:url,p_deployment_id:deploymentId,p_artifact_hash:artifactHash,p_baseline_hash:baseline,p_profile:profile});
  if(createErr)return Response.json({ok:false,error:createErr.message},{status:500});
  const outputs:any[]=[];
  if(profile==='backend_api'){
    const p=await apiProbe(url);
    for(const t of [{key:'api_health',pass:p.ok===true&&p.status>=200&&p.status<400,result:{...p,criterion:'reachable_2xx_3xx'}},{key:'api_contract',pass:p.status>0&&p.status<500&&p.body_bytes>0,result:{...p,criterion:'nonempty_response_no_5xx'}},{key:'api_security',pass:p.https===true,result:{...p,criterion:'final_url_https'}}]){const re=await record(suiteId,t.key,'backend_api','server',t.pass,t.result);outputs.push({key:t.key,mode:'backend_api',device:'server',pass:t.pass,record_error:re})}
  }else{
    for(const [key,mode,device] of WEB_TESTS){const result=await browserTest(url,mode,device,deploymentId,artifactHash,baseline);const pass=result?.ok===true&&result?.pass===true&&result?.target_reached===true;const re=await record(suiteId,key,mode,device,pass,result);outputs.push({key,mode,device,pass,record_error:re,target_reached:result?.target_reached})}
  }
  const {data:final,error:finalErr}=await db.rpc('barman_finalize_qa_suite',{p_suite_id:suiteId});
  const {data:verify,error:verifyErr}=await db.rpc('barman_independent_verify_qa_suite',{p_suite_id:suiteId,p_expected_deployment_id:deploymentId,p_expected_artifact_hash:artifactHash});
  return Response.json({ok:!finalErr&&!verifyErr,suite_id:suiteId,profile,pass:verify?.state==='PASS',final,independent_verification:verify,errors:[finalErr?.message,verifyErr?.message].filter(Boolean),results:outputs});
});