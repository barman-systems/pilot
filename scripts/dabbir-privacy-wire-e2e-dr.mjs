import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {Readable} from 'node:stream';

const DR='xbybbvdobhvjdmeqfjot';
const PROD='fphpoysqdsceniwduxjq';
const BRANCH='fix/privacy-executor-acl-p1';
const PUBLIC_MD5='d33cfc830f58d353ad2c903108b7e7c5';
const PRIVATE_MD5='501f30efaf91eb13af7505fe25bb4510';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const q=v=>`'${String(v).replaceAll("'","''")}'`;
const clean=(v,max=500)=>String(v??'')
 .replace(/sb_secret_[A-Za-z0-9._-]+/g,'sb_secret_[REDACTED]')
 .replace(/sb_publishable_[A-Za-z0-9._-]+/g,'sb_publishable_[REDACTED]')
 .replace(/eyJ[A-Za-z0-9._-]{20,}/g,'[JWT_REDACTED]')
 .replace(/dabbir-privacy-wire-[^@\s]+@example\.invalid/g,'[QA_EMAIL]')
 .slice(0,max);

async function fetchJson(url,options={}){
 const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(30000),...options});
 const text=await response.text();let json=null;try{json=text?JSON.parse(text):null;}catch{}
 return {ok:response.ok,status:response.status,text,json};
}

function req(token,body){
 const r=Readable.from([Buffer.from(JSON.stringify(body))]);
 r.method='POST';r.headers={host:'privacy-wire-e2e.local',origin:'https://privacy-wire-e2e.local',cookie:`__Host-dabbir_access=${encodeURIComponent(token)}`,'content-type':'application/json'};
 return r;
}
function res(){return {statusCode:200,body:'',headers:new Map(),setHeader(k,v){this.headers.set(String(k).toLowerCase(),v);},end(v=''){this.body+=String(v);}};}
async function invoke(handler,token,body){const s=res();await handler(req(token,body),s);let json=null;try{json=JSON.parse(s.body);}catch{}return {status:s.statusCode,json,body:s.body};}

export async function runPrivacyWireE2E({managementToken,headSha}){
 assert.equal(process.env.GITHUB_EVENT_NAME,'pull_request','WIRE_PULL_REQUEST_ONLY');
 assert.equal(process.env.GITHUB_HEAD_REF,BRANCH,'WIRE_BRANCH_DENIED');
 assert.match(String(headSha||''),/^[0-9a-f]{40}$/,'WIRE_HEAD_SHA_REQUIRED');
 assert.ok(managementToken,'WIRE_MANAGEMENT_TOKEN_REQUIRED');

 const runId=`${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
 const ids={businessA:crypto.randomUUID(),businessB:crypto.randomUUID(),exportCustomer:crypto.randomUUID(),deleteCustomer:crypto.randomUUID(),staffCustomer:crypto.randomUUID(),crossCustomer:crypto.randomUUID(),exportRequest:crypto.randomUUID(),deleteRequest:crypto.randomUUID(),staffRequest:crypto.randomUUID(),crossRequest:crypto.randomUUID()};
 const ownerEmail=`dabbir-privacy-wire-owner-${runId}@example.invalid`,staffEmail=`dabbir-privacy-wire-staff-${runId}@example.invalid`;
 const ownerPassword=`Dabbir-${crypto.randomBytes(14).toString('base64url')}!Aa9`,staffPassword=`Dabbir-${crypto.randomBytes(14).toString('base64url')}!Bb8`;
 const evidence={contract:'DABBIR_PRIVACY_WIRE_E2E_DR_V1',candidate_head_sha:headSha,github_run_id:String(process.env.GITHUB_RUN_ID||''),target_project_ref:null,target_origin:null,production_ref_blocked:false,acl:null,auth:null,export:null,delete:null,unauthorized:null,cross_tenant:null,direct_private_guard:null,cleanup:null,started_at:new Date().toISOString(),finished_at:null,verdict:'RUNNING'};
 let origin='',serviceKey='',publicKey='',owner=null,staff=null,fixture=false,primary=null;

 async function mgmt(path,options={}){const r=await fetchJson(`https://api.supabase.com${path}`,{...options,headers:{authorization:`Bearer ${managementToken}`,accept:'application/json',...(options.body?{'content-type':'application/json'}:{}),...(options.headers||{})}});if(!r.ok)throw Error(`WIRE_MANAGEMENT_${r.status}:${clean(r.text)}`);return r.json;}
 async function sql(query){const r=await mgmt(`/v1/projects/${DR}/database/query`,{method:'POST',body:JSON.stringify({query})});if(!Array.isArray(r))throw Error('WIRE_DB_RESULT_INVALID');return r;}
 const adminHeaders=()=>({apikey:serviceKey,authorization:`Bearer ${serviceKey}`,'content-type':'application/json',accept:'application/json'});
 async function createUser(email,password,label){const r=await fetchJson(`${origin}/auth/v1/admin/users`,{method:'POST',headers:adminHeaders(),body:JSON.stringify({email,password,email_confirm:true,user_metadata:{dabbir_qa:true,dabbir_qa_run_id:runId,role_label:label}})});if(!r.ok)throw Error(`WIRE_CREATE_USER_${r.status}:${clean(r.text)}`);const u=r.json?.user||r.json;assert.match(String(u?.id||''),UUID);return {id:String(u.id),email,password};}
 async function deleteUser(user){if(!user?.id||!serviceKey)return false;const r=await fetchJson(`${origin}/auth/v1/admin/users/${encodeURIComponent(user.id)}`,{method:'DELETE',headers:adminHeaders()});return r.ok;}
 async function login(user){const r=await fetchJson(`${origin}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:publicKey,'content-type':'application/json'},body:JSON.stringify({email:user.email,password:user.password})});if(!r.ok)throw Error(`WIRE_LOGIN_${r.status}:${clean(r.text)}`);const token=String(r.json?.access_token||'');assert.equal(token.split('.').length,3);return token;}

 try{
  const project=await mgmt(`/v1/projects/${DR}`);const resolved=String(project?.ref||project?.id||'').trim();
  assert.equal(resolved,DR,'WIRE_RESOLVED_REF_NOT_DR');assert.notEqual(resolved,PROD,'WIRE_PRODUCTION_REF_DENIED');
  origin=`https://${resolved}.supabase.co`;assert.equal(new URL(origin).hostname,`${DR}.supabase.co`,'WIRE_RESOLVED_ORIGIN_NOT_DR');assert.notEqual(new URL(origin).hostname,`${PROD}.supabase.co`,'WIRE_PRODUCTION_ORIGIN_DENIED');
  evidence.target_project_ref=resolved;evidence.target_origin=origin;evidence.production_ref_blocked=true;

  const rawKeys=await mgmt(`/v1/projects/${DR}/api-keys?reveal=true`);const keys=Array.isArray(rawKeys)?rawKeys:Array.isArray(rawKeys?.data)?rawKeys.data:Array.isArray(rawKeys?.keys)?rawKeys.keys:[];const val=x=>String(x?.api_key||x?.key||x?.value||'').trim();
  serviceKey=val(keys.find(x=>String(x?.name||x?.type||'').toLowerCase().includes('service_role'))||keys.find(x=>val(x).startsWith('sb_secret_')));
  publicKey=val(keys.find(x=>val(x).startsWith('sb_publishable_'))||keys.find(x=>String(x?.name||x?.type||'').toLowerCase().includes('anon')));
  assert.ok(serviceKey,'WIRE_SERVICE_KEY_NOT_RESOLVED');assert.ok(publicKey,'WIRE_PUBLISHABLE_KEY_NOT_RESOLVED');

  const acl=(await sql(`select has_function_privilege('authenticated','public.dabbir_execute_customer_privacy_request(uuid,text)','EXECUTE') public_exec,has_function_privilege('authenticated','dabbir_private.dabbir_execute_customer_privacy_request(uuid,text)','EXECUTE') private_exec,has_function_privilege('service_role','dabbir_private.dabbir_execute_customer_privacy_request(uuid,text)','EXECUTE') service_exec,md5(pg_get_functiondef('public.dabbir_execute_customer_privacy_request(uuid,text)'::regprocedure)) public_md5,md5(pg_get_functiondef('dabbir_private.dabbir_execute_customer_privacy_request(uuid,text)'::regprocedure)) private_md5;`))[0];
  assert.equal(acl.public_exec,true);assert.equal(acl.private_exec,true);assert.equal(acl.service_exec,false);assert.equal(acl.public_md5,PUBLIC_MD5);assert.equal(acl.private_md5,PRIVATE_MD5);evidence.acl={public_exec:true,private_exec:true,service_private_exec:false,public_md5:acl.public_md5,private_md5:acl.private_md5};

  owner=await createUser(ownerEmail,ownerPassword,'owner');staff=await createUser(staffEmail,staffPassword,'staff');
  const i=ids;
  await sql(`begin;
   insert into public.dabbir_businesses(id,slug,name,business_type,owner_id,demo_mode) values (${q(i.businessA)}::uuid,${q(`qa-privacy-a-${runId}`)},${q(`DABBIR AI QA privacy-wire ${runId} A`)},'services',${q(owner.id)}::uuid,true),(${q(i.businessB)}::uuid,${q(`qa-privacy-b-${runId}`)},${q(`DABBIR AI QA privacy-wire ${runId} B`)},'services',null,true);
   insert into public.dabbir_memberships(business_id,user_id,role,status,permissions,accepted_at) values (${q(i.businessA)}::uuid,${q(owner.id)}::uuid,'owner','active','{}'::text[],now()),(${q(i.businessA)}::uuid,${q(staff.id)}::uuid,'staff','active','{}'::text[],now());
   insert into public.dabbir_customers(id,business_id,display_name,channel_handle) values (${q(i.exportCustomer)}::uuid,${q(i.businessA)}::uuid,'Privacy Wire Export','qa-export-${runId}'),(${q(i.deleteCustomer)}::uuid,${q(i.businessA)}::uuid,'Privacy Wire Delete','qa-delete-${runId}'),(${q(i.staffCustomer)}::uuid,${q(i.businessA)}::uuid,'Privacy Wire Staff','qa-staff-${runId}'),(${q(i.crossCustomer)}::uuid,${q(i.businessB)}::uuid,'Privacy Wire Cross','qa-cross-${runId}');
   insert into public.dabbir_privacy_requests(id,business_id,customer_id,request_type,status,requested_by,correlation_id) values (${q(i.exportRequest)}::uuid,${q(i.businessA)}::uuid,${q(i.exportCustomer)}::uuid,'CUSTOMER_EXPORT','REQUESTED',${q(owner.id)}::uuid,'wire-export'),(${q(i.deleteRequest)}::uuid,${q(i.businessA)}::uuid,${q(i.deleteCustomer)}::uuid,'CUSTOMER_DELETE','REQUESTED',${q(owner.id)}::uuid,'wire-delete'),(${q(i.staffRequest)}::uuid,${q(i.businessA)}::uuid,${q(i.staffCustomer)}::uuid,'CUSTOMER_EXPORT','REQUESTED',${q(staff.id)}::uuid,'wire-staff'),(${q(i.crossRequest)}::uuid,${q(i.businessB)}::uuid,${q(i.crossCustomer)}::uuid,'CUSTOMER_EXPORT','REQUESTED',${q(owner.id)}::uuid,'wire-cross');commit;`);
  fixture=true;

  const ownerToken=await login(owner),staffToken=await login(staff);evidence.auth={owner_user_jwt:true,staff_user_jwt:true,elevated_key_used_in_application_path:false};
  process.env.SUPABASE_URL=origin;process.env.SUPABASE_AUTH_URL=origin;process.env.SUPABASE_DATA_URL=origin;process.env.SUPABASE_PUBLISHABLE_KEY=publicKey;process.env.DABBIR_SUPABASE_TIMEOUT_MS='15000';
  const {default:handler}=await import(`../api/privacy/execute.js?wire=${runId}`);

  const ex=await invoke(handler,ownerToken,{request_id:i.exportRequest});assert.equal(ex.status,200,`WIRE_EXPORT_HTTP_${ex.status}:${clean(ex.body)}`);assert.equal(ex.json?.result?.export?.schema_version,'dabbir_customer_export_v1');assert.equal(ex.json?.result?.export?.business_id,i.businessA);assert.equal(ex.json?.result?.export?.customer_id,i.exportCustomer);
  const exRow=(await sql(`select status,result_ref,execution_summary from public.dabbir_privacy_requests where id=${q(i.exportRequest)}::uuid;`))[0];assert.equal(exRow.status,'COMPLETED');assert.match(String(exRow.result_ref||''),/^sha256:[0-9a-f]{64}$/);assert.equal(exRow.execution_summary?.mode,'INLINE_EXPORT');assert.equal(Object.hasOwn(exRow.execution_summary||{},'export'),false);evidence.export={http_status:200,canonical_payload:true,hash_persisted:true,plaintext_export_persisted:false};

  const del=await invoke(handler,ownerToken,{request_id:i.deleteRequest,confirmation:`DELETE_CUSTOMER:${i.deleteCustomer}`});assert.equal(del.status,200,`WIRE_DELETE_HTTP_${del.status}:${clean(del.body)}`);assert.equal(del.json?.result?.deleted,true);
  const delRow=(await sql(`select (select count(*)::int from public.dabbir_customers where id=${q(i.deleteCustomer)}::uuid) customer_count,status,customer_id,target_ref_hash from public.dabbir_privacy_requests where id=${q(i.deleteRequest)}::uuid;`))[0];assert.equal(Number(delRow.customer_count),0);assert.equal(delRow.status,'COMPLETED');assert.equal(delRow.customer_id,null);assert.match(String(delRow.target_ref_hash||''),/^[0-9a-f]{64}$/);evidence.delete={http_status:200,customer_removed:true,request_completed:true};

  const unauth=await invoke(handler,staffToken,{request_id:i.staffRequest});assert.equal(unauth.status,403);assert.equal(unauth.json?.error,'OWNER_REQUIRED');evidence.unauthorized={http_status:403,error:'OWNER_REQUIRED'};
  const cross=await invoke(handler,ownerToken,{request_id:i.crossRequest});assert.equal(cross.status,403);assert.equal(cross.json?.error,'OWNER_REQUIRED');evidence.cross_tenant={http_status:403,error:'OWNER_REQUIRED'};

  const direct=(await sql(`begin;set local role authenticated;set local request.jwt.claim.sub=${q(staff.id)};set local request.jwt.claim.role='authenticated';set local request.jwt.claims=${q(JSON.stringify({sub:staff.id,role:'authenticated',aud:'authenticated'}))};do $x$ begin perform dabbir_private.dabbir_execute_customer_privacy_request(${q(i.staffRequest)}::uuid,null);raise exception 'WIRE_PRIVATE_OWNER_GATE_BYPASSED';exception when others then if sqlerrm<>'OWNER_REQUIRED' then raise;end if;end $x$;select 'OWNER_REQUIRED' blocked_by;rollback;`)).find(x=>x?.blocked_by);assert.equal(direct?.blocked_by,'OWNER_REQUIRED');evidence.direct_private_guard={blocked:true,error:'OWNER_REQUIRED'};
  evidence.verdict='PASS';
 }catch(error){primary=error;evidence.verdict='FAIL';evidence.error=clean(error?.stack||error?.message||error);}
 finally{
  const c={business_a:false,business_b:false,owner_user:false,staff_user:false,remaining_businesses:null,remaining_users:null,errors:[]};
  if(origin&&serviceKey){
   if(fixture){for(const [key,id] of [['business_a',ids.businessA],['business_b',ids.businessB]]){try{const rows=await sql(`select public.dabbir_qa_cleanup_business(${q(id)}::uuid) result;`);c[key]=rows?.[0]?.result?.ok===true;}catch(e){c.errors.push(`${key}:${clean(e?.message||e)}`);}}}
   const users=[owner?.id,staff?.id].filter(x=>UUID.test(String(x||'')));if(users.length){try{const list=users.map(x=>`${q(x)}::uuid`).join(',');await sql(`begin;delete from public.account_access_state where user_id in (${list});delete from public.dabbir_user_accounts where user_id in (${list});commit;`);}catch(e){c.errors.push(`user_rows:${clean(e?.message||e)}`);}}
   try{c.owner_user=owner?await deleteUser(owner):true;}catch(e){c.errors.push(`owner_user:${clean(e?.message||e)}`);}
   try{c.staff_user=staff?await deleteUser(staff):true;}catch(e){c.errors.push(`staff_user:${clean(e?.message||e)}`);}
   try{const rows=await sql(`select (select count(*)::int from public.dabbir_businesses where id in (${q(ids.businessA)}::uuid,${q(ids.businessB)}::uuid)) remaining_businesses,(select count(*)::int from auth.users where id in (${owner?.id?`${q(owner.id)}::uuid`:'null'},${staff?.id?`${q(staff.id)}::uuid`:'null'})) remaining_users;`);c.remaining_businesses=Number(rows?.[0]?.remaining_businesses??-1);c.remaining_users=Number(rows?.[0]?.remaining_users??-1);}catch(e){c.errors.push(`readback:${clean(e?.message||e)}`);}
  }else if(owner||staff||fixture)c.errors.push('CLEANUP_CREDENTIALS_UNAVAILABLE');
  evidence.cleanup=c;if(c.remaining_businesses!==0||c.remaining_users!==0||c.errors.length){evidence.verdict='FAIL';evidence.error=evidence.error||'WIRE_CLEANUP_NOT_VERIFIED';}
  evidence.finished_at=new Date().toISOString();const digestSource={...evidence};delete digestSource.evidence_sha256;evidence.evidence_sha256=crypto.createHash('sha256').update(JSON.stringify(digestSource)).digest('hex');
  fs.mkdirSync('test-results/privacy-wire-e2e-dr',{recursive:true});fs.writeFileSync('test-results/privacy-wire-e2e-dr/evidence.json',JSON.stringify(evidence,null,2)+'\n');
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`\n## #752 DR wire E2E\n- verdict: **${evidence.verdict}**\n- candidate: \`${headSha}\`\n- resolved target: \`${evidence.target_project_ref||'UNRESOLVED'}\`\n- Production blocked: \`${evidence.production_ref_blocked}\`\n- export/delete: \`${evidence.export?.http_status??'NOT_RUN'}/${evidence.delete?.http_status??'NOT_RUN'}\`\n- unauthorized/cross-tenant: \`${evidence.unauthorized?.http_status??'NOT_RUN'}/${evidence.cross_tenant?.http_status??'NOT_RUN'}\`\n- cleanup remaining businesses/users: \`${c.remaining_businesses}/${c.remaining_users}\`\n- evidence sha256: \`${evidence.evidence_sha256}\`\n`);
  console.log(`DABBIR_PRIVACY_WIRE_E2E_EVIDENCE ${JSON.stringify(evidence)}`);
 }
 if(evidence.verdict!=='PASS')throw primary||Error(evidence.error||'WIRE_E2E_FAILED');return evidence;
}
