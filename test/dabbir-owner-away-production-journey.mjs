import fs from 'node:fs';
import crypto from 'node:crypto';

const ORIGIN=String(process.env.PRODUCTION_ORIGIN||'').trim().replace(/\/$/,'');
if(!/^https:\/\/[^/]+$/i.test(ORIGIN))throw new Error('PRODUCTION_ORIGIN_REQUIRED');
const PROJECT_REF=String(process.env.SUPABASE_PROJECT_REF||'spohjzrsymsmzsseygtw').trim();
const QA_CONTROL_URL=`https://${PROJECT_REF}.supabase.co/functions/v1/barman-qa-suite-runner`;
const OIDC_AUDIENCE='dabbir-ai-qa';
const REPORT_PATH=process.env.AWAY_REPORT_PATH||'dabbir-owner-away-production-report.json';
const RUN_ID=`${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const RUN_LABEL=`DABBIR AI QA ${RUN_ID}`;

const report={run_id:RUN_ID,journey:'DABBIR_OWNER_AWAY_PRODUCTION',production_origin:ORIGIN,started_at:new Date().toISOString(),completed_at:null,verdict:'RUNNING',required_failures:0,steps:[],cleanup:[]};
let owner=null,employee=null,businessId=null,oidcToken=null;

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const assert=(condition,message='ASSERTION_FAILED')=>{if(!condition)throw new Error(message)};
const small=(value,max=500)=>String(typeof value==='string'?value:JSON.stringify(value??''))
  .replace(/eyJ[A-Za-z0-9._-]{30,}/g,'[JWT_REDACTED]')
  .replace(/dabbir-qa-[^@\s]+@example\.com/gi,'[QA_EMAIL]')
  .replace(/Dabbir-QA-[A-Za-z0-9_!\-]+/g,'[QA_PASSWORD]')
  .slice(0,max);

async function rawFetch(url,options={},retry=true){
  const attempts=retry?3:1;let last=null;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{
      const response=await fetch(url,{redirect:'follow',...options});
      const text=await response.text();let json=null;try{json=text?JSON.parse(text):null}catch{}
      last={response,status:response.status,ok:response.ok,text,json};
      if(![429,502,503,504].includes(response.status)||attempt===attempts)return last;
    }catch(error){last={response:null,status:0,ok:false,text:String(error?.message||error),json:null};if(attempt===attempts)return last}
    await sleep(500*attempt);
  }
  return last;
}

async function step(name,fn){
  const started=Date.now();const row={name,status:'RUNNING',duration_ms:null,http_status:null,detail:null};report.steps.push(row);
  try{const result=await fn();row.status='PASS';row.duration_ms=Date.now()-started;if(result?.status!=null)row.http_status=result.status;if(result?.detail)row.detail=small(result.detail);console.log(`PASS ${name} (${row.duration_ms}ms)`);return result}
  catch(error){row.status='FAIL';row.duration_ms=Date.now()-started;row.detail=small(error?.stack||error?.message||error);report.required_failures++;console.error(`FAIL ${name} — ${row.detail}`);return null}
}

async function githubOidc(){
  if(oidcToken)return oidcToken;
  const requestUrl=String(process.env.ACTIONS_ID_TOKEN_REQUEST_URL||'').trim();
  const requestToken=String(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN||'').trim();
  assert(requestUrl&&requestToken,'GITHUB_ACTIONS_OIDC_ENV_REQUIRED');
  const joiner=requestUrl.includes('?')?'&':'?';
  const result=await rawFetch(`${requestUrl}${joiner}audience=${encodeURIComponent(OIDC_AUDIENCE)}`,{headers:{authorization:`Bearer ${requestToken}`,accept:'application/json'}},false);
  assert(result.ok&&result.json?.value,`GITHUB_OIDC_MINT_FAILED_${result.status}:${small(result.text)}`);
  oidcToken=result.json.value;return oidcToken;
}

async function qaControl(action,payload={}){
  const result=await rawFetch(QA_CONTROL_URL,{method:'POST',headers:{authorization:`Bearer ${await githubOidc()}`,'content-type':'application/json',accept:'application/json'},body:JSON.stringify({action,run_id:RUN_ID,...payload})},false);
  assert(result.ok&&result.json?.ok,`QA_CONTROL_${action}_FAILED_${result.status}:${small(result.text)}`);return result;
}

class Session{
  constructor(){this.cookies=new Map()}
  capture(response){
    if(!response?.headers)return;
    const rows=typeof response.headers.getSetCookie==='function'?response.headers.getSetCookie():[response.headers.get('set-cookie')].filter(Boolean);
    for(const row of rows){const pair=String(row).split(';',1)[0];const i=pair.indexOf('=');if(i<=0)continue;const k=pair.slice(0,i).trim(),v=pair.slice(i+1).trim();if(v)this.cookies.set(k,v);else this.cookies.delete(k)}
  }
  async request(path,{method='GET',body,retry=true}={}){
    const upper=method.toUpperCase();const headers={accept:'application/json'};
    if(!['GET','HEAD'].includes(upper))headers.origin=ORIGIN;
    if(body!==undefined)headers['content-type']='application/json';
    if(this.cookies.size)headers.cookie=[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; ');
    const result=await rawFetch(`${ORIGIN}${path}`,{method:upper,headers,body:body===undefined?undefined:JSON.stringify(body)},retry);this.capture(result.response);return result;
  }
}
const ownerSession=new Session();const employeeSession=new Session();

async function login(session,identity){const result=await session.request('/api/auth/login',{method:'POST',body:{email:identity.email,password:identity.password}});assert(result.ok&&result.json?.ok,`LOGIN_FAILED_${result.status}:${small(result.text)}`);assert(session.cookies.size>0,'LOGIN_COOKIE_MISSING');return result}

async function waitForAwayEndpoint(){
  let last=null;
  for(let attempt=1;attempt<=30;attempt++){
    last=await ownerSession.request(`/api/owner-away-mode?business_id=${encodeURIComponent(businessId)}`,{retry:false});
    if(last.status!==404)return last;
    await sleep(4000);
  }
  return last;
}

async function run(){
  await step('01_oidc_qa_bootstrap',async()=>{await githubOidc();const result=await qaControl('dabbir_ai_qa_bootstrap');owner=result.json?.identities?.owner;employee=result.json?.identities?.employee;assert(owner?.id&&owner?.email&&owner?.password,'OWNER_QA_IDENTITY_MISSING');assert(employee?.id&&employee?.email&&employee?.password,'EMPLOYEE_QA_IDENTITY_MISSING');return{status:result.status}});
  await step('02_owner_login_and_isolated_business',async()=>{await login(ownerSession,owner);const create=await ownerSession.request('/api/dabbir-runtime-fast',{method:'POST',body:{action:'create_business',name:RUN_LABEL,business_type:'store',locale:'ar-AE'}});assert(create.ok&&create.json?.business_id,`BUSINESS_CREATE_FAILED_${create.status}:${small(create.text)}`);businessId=create.json.business_id;return{status:create.status}});
  let inviteToken=null;
  await step('03_employee_membership',async()=>{const invite=await ownerSession.request('/api/team/invitations',{method:'POST',body:{business_id:businessId,email:employee.email,display_name:'Away QA Employee',role:'employee',permissions:['view_business','view_conversations']}});assert(invite.ok&&invite.json?.invite_token,`INVITE_FAILED_${invite.status}:${small(invite.text)}`);inviteToken=invite.json.invite_token;await login(employeeSession,employee);const accept=await employeeSession.request('/api/team/accept-invite',{method:'POST',body:{token:inviteToken}});assert(accept.ok&&accept.json?.invitation_consumed===true,`INVITE_ACCEPT_FAILED_${accept.status}:${small(accept.text)}`);return{status:accept.status}});
  await step('04_real_warning_fixture',async()=>{const create=await ownerSession.request('/api/owner-operations',{method:'POST',body:{action:'create_product',business_id:businessId,sku:`AWAY-${RUN_ID}`.slice(0,70),name:'Away Mode QA Product',price_aed:25,quantity:3}});assert(create.ok&&create.json?.ok,`PRODUCT_CREATE_FAILED_${create.status}:${small(create.text)}`);return{status:create.status}});
  let warningItemId=null;
  await step('05_canonical_escalation_contains_warning',async()=>{const center=await ownerSession.request(`/api/owner-action-center?business_id=${encodeURIComponent(businessId)}`);assert(center.ok&&center.json?.ok,`ACTION_CENTER_FAILED_${center.status}:${small(center.text)}`);const warning=(center.json.items||[]).find(item=>item.type==='inventory'&&item.severity==='warning');assert(warning?.id,'REAL_WARNING_ITEM_MISSING');warningItemId=warning.id;return{status:center.status,detail:warning.id}});
  await step('06_away_endpoint_is_deployed',async()=>{const result=await waitForAwayEndpoint();assert(result&&result.status!==404,'OWNER_AWAY_ENDPOINT_NOT_DEPLOYED');assert(result.ok&&result.json?.ok,`OWNER_AWAY_LOOKUP_FAILED_${result.status}:${small(result.text)}`);return{status:result.status}});
  await step('07_owner_activates_away_mode',async()=>{const now=Date.now();const result=await ownerSession.request('/api/owner-away-mode',{method:'PUT',body:{business_id:businessId,enabled:true,starts_at:new Date(now-5000).toISOString(),ends_at:new Date(now+3600_000).toISOString(),timezone:'Asia/Dubai'}});assert(result.ok&&result.json?.verified_persisted===true,`AWAY_ACTIVATE_FAILED_${result.status}:${small(result.text)}`);assert(result.json?.mode?.active===true,'AWAY_MODE_NOT_ACTIVE');return{status:result.status}});
  await step('08_employee_cannot_disable_owner_away_mode',async()=>{const result=await employeeSession.request('/api/owner-away-mode',{method:'PUT',body:{business_id:businessId,enabled:false,timezone:'Asia/Dubai'},retry:false});assert(result.status===403&&result.json?.error==='OWNER_REQUIRED',`EMPLOYEE_AWAY_WRITE_NOT_DENIED_${result.status}:${small(result.text)}`);return{status:result.status}});
  await step('09_away_policy_defers_real_noncritical_warning',async()=>{const result=await ownerSession.request(`/api/owner-action-center-away?business_id=${encodeURIComponent(businessId)}`);assert(result.ok&&result.json?.ok,`AWAY_ACTION_CENTER_FAILED_${result.status}:${small(result.text)}`);assert(result.json?.owner_away?.active===true,'AWAY_POLICY_NOT_ACTIVE');assert(Number(result.json?.deferred?.count)>=1,'AWAY_DEFERRED_COUNT_MISSING');assert(!(result.json.items||[]).some(item=>item.id===warningItemId),'NONCRITICAL_WARNING_STILL_ESCALATED');assert(result.json?.truth?.critical_items_never_suppressed===true,'CRITICAL_SAFETY_TRUTH_MISSING');return{status:result.status,detail:`deferred=${result.json.deferred.count}`}});
  await step('10_owner_deactivates_and_escalation_returns',async()=>{const stop=await ownerSession.request('/api/owner-away-mode',{method:'PUT',body:{business_id:businessId,enabled:false,timezone:'Asia/Dubai'}});assert(stop.ok&&stop.json?.verified_persisted===true&&stop.json?.mode?.active===false,`AWAY_STOP_FAILED_${stop.status}:${small(stop.text)}`);const result=await ownerSession.request(`/api/owner-action-center-away?business_id=${encodeURIComponent(businessId)}`);assert(result.ok&&result.json?.owner_away?.active===false,'AWAY_MODE_STILL_ACTIVE');assert(Number(result.json?.deferred?.count)===0,'DEFERRED_ITEMS_REMAIN_AFTER_STOP');assert((result.json.items||[]).some(item=>item.id===warningItemId),'WARNING_DID_NOT_RETURN_AFTER_STOP');return{status:result.status}});
}

try{await run()}catch(error){report.required_failures++;console.error(`FATAL ${small(error?.stack||error?.message||error)}`)}finally{
  if(owner?.id||employee?.id||businessId){try{const result=await qaControl('dabbir_ai_qa_cleanup',{business_id:businessId||undefined,owner_user_id:owner?.id||undefined,employee_user_id:employee?.id||undefined});report.cleanup.push({item:'qa_tenant_and_auth_users',status:'PASS',http_status:result.status})}catch(error){report.cleanup.push({item:'qa_tenant_and_auth_users',status:'FAIL',detail:small(error?.message||error)});report.required_failures++}}
  report.completed_at=new Date().toISOString();report.verdict=report.required_failures===0?'PASS':'FAIL';fs.writeFileSync(REPORT_PATH,JSON.stringify(report,null,2));console.log(`DABBIR OWNER AWAY PRODUCTION: ${report.verdict}`);
}
if(report.required_failures>0)process.exitCode=1;
