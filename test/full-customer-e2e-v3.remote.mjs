import crypto from 'node:crypto';
import fs from 'node:fs';

const PILOT_ORIGIN = 'https://pilot-taupe.vercel.app';
const SUPABASE_URL = 'https://spohjzrsymsmzsseygtw.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_WPxhwNf08BW1FgBptkinWg_3j75O4O3';
const MAIL_API = 'https://api.mail.tm';
const runId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const mailboxes = [];
const report = {
  run_id: runId,
  target: PILOT_ORIGIN,
  synthetic_only: true,
  started_at: new Date().toISOString(),
  steps: [],
  cleanup: { user_ids: [], business_ids: [] },
};

function safeError(error) {
  return String(error?.message || error || 'unknown_error')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/P![A-Za-z0-9_-]{12,}/g, '[password]')
    .replace(/eyJ[A-Za-z0-9._-]{20,}/g, '[token]');
}
function must(condition, message) { if (!condition) throw new Error(message); }
async function step(name, fn, { fatal = false } = {}) {
  try {
    const details = await fn();
    report.steps.push({ name, ok: true, ...(details || {}) });
    console.log(`PASS ${name}${details?.status ? ` [${details.status}]` : ''}`);
    return details;
  } catch (error) {
    report.steps.push({ name, ok: false, error: safeError(error) });
    console.log(`FAIL ${name}: ${safeError(error)}`);
    if (fatal) throw error;
    return null;
  }
}
async function json(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 300) }; }
}
class CookieJar {
  constructor() { this.cookies = new Map(); }
  absorb(response) {
    const lines = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : (response.headers.get('set-cookie') || '').split(/,(?=\s*__Host-)/g).filter(Boolean);
    for (const line of lines) {
      const pair = line.split(';', 1)[0];
      const i = pair.indexOf('=');
      if (i < 0) continue;
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (v) this.cookies.set(k, v); else this.cookies.delete(k);
    }
  }
  header() { return [...this.cookies].map(([k,v]) => `${k}=${v}`).join('; '); }
  get(name) { const v = this.cookies.get(name); return v ? decodeURIComponent(v) : null; }
}
async function pilot(path, { method='GET', body, jar, origin=PILOT_ORIGIN } = {}) {
  const headers = { accept: 'application/json', origin };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (jar?.header()) headers.cookie = jar.header();
  const response = await fetch(`${PILOT_ORIGIN}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  jar?.absorb(response);
  return { response, payload: await json(response) };
}
async function rest(token, resource, { method='GET', body, prefer='return=representation' } = {}) {
  const headers = { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${token}`, accept:'application/json' };
  if (body !== undefined) headers['content-type']='application/json';
  if (method !== 'GET') headers.prefer=prefer;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${resource}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { response, payload: await json(response) };
}
async function mail(path, options={}, token=null) {
  const headers = new Headers(options.headers || {});
  headers.set('accept','application/ld+json, application/json');
  if (options.body !== undefined) headers.set('content-type','application/json');
  if (token) headers.set('authorization',`Bearer ${token}`);
  const response = await fetch(`${MAIL_API}${path}`, { ...options, headers });
  if (!response.ok) throw new Error(`mail_api_${response.status}`);
  return { response, payload: await json(response) };
}
function collection(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.['hydra:member'] || payload?.member || payload?.items || [];
}
async function makeMailbox(label) {
  const { payload } = await mail('/domains?page=1');
  const domain = collection(payload).find(d => d?.domain && d.isActive !== false)?.domain;
  must(domain,'mail_domain_unavailable');
  const address = `pilot-e2e-${label}-${crypto.randomBytes(5).toString('hex')}@${domain}`;
  const password = crypto.randomBytes(24).toString('base64url');
  const account = await mail('/accounts',{method:'POST',body:JSON.stringify({address,password})});
  const tok = await mail('/token',{method:'POST',body:JSON.stringify({address,password})});
  must(account.payload?.id && tok.payload?.token,'mailbox_creation_failed');
  const box = { id: account.payload.id, address, password, token: tok.payload.token };
  mailboxes.push(box);
  return box;
}
function verificationLink(message) {
  const raw = JSON.stringify({html:message?.html,text:message?.text,intro:message?.intro});
  const normalized = raw.replace(/&amp;/g,'&').replace(/\\u0026/g,'&').replace(/\\\//g,'/');
  const urls = normalized.match(/https?:\/\/[^\s"'<>]+/g) || [];
  return urls.map(u => u.replace(/[\\,}\]]+$/g,'')).find(u => u.includes('/auth/v1/verify') || u.includes('token_hash=')) || null;
}
async function confirm(box) {
  const deadline=Date.now()+70000;
  while(Date.now()<deadline){
    const messages=collection((await mail('/messages?page=1',{},box.token)).payload);
    for(const m of messages){
      const full=(await mail(`/messages/${m.id}`,{},box.token)).payload;
      const link=verificationLink(full);
      if(!link) continue;
      const r=await fetch(link,{redirect:'manual'});
      if(r.status>=200&&r.status<400) return;
    }
    await new Promise(r=>setTimeout(r,1500));
  }
  throw new Error('verification_email_timeout');
}
async function createUser(label) {
  const box=await makeMailbox(label);
  const password=`P!${crypto.randomBytes(24).toString('base64url')}`;
  const signup=await pilot('/api/auth/signup',{method:'POST',body:{email:box.address,password},jar:new CookieJar()});
  must([201,202].includes(signup.response.status)&&signup.payload?.ok===true,`signup_${signup.response.status}`);
  if(!signup.payload?.authenticated) await confirm(box);
  const jar=new CookieJar();
  const login=await pilot('/api/auth/login',{method:'POST',body:{email:box.address,password},jar});
  must(login.response.status===200&&login.payload?.authenticated===true,'login_failed');
  const session=await pilot('/api/auth/session',{jar});
  must(session.response.status===200&&session.payload?.authenticated===true&&session.payload?.user?.id,'session_failed');
  const user={id:session.payload.user.id,password,box,jar,token:jar.get('__Host-pilot_access')};
  report.cleanup.user_ids.push(user.id);
  return user;
}
function one(payload,label){ must(Array.isArray(payload)&&payload.length===1,`${label}_representation_missing`); return payload[0]; }
async function expectDenied(result,label){
  const denied=result.response.status>=400 || (Array.isArray(result.payload)&&result.payload.length===0);
  must(denied,`${label}_unexpectedly_allowed`);
}

let owner, employee, businessA, businessB, customer, service, conversation, channel, product;
let fatal=null;
try {
  await step('UI production root is not a preview-only shell',async()=>{
    const r=await fetch(PILOT_ORIGIN,{redirect:'manual'}); const text=await r.text();
    must(r.status===200,'root_unavailable');
    must(!/Full Product Preview|preview only|معاينة فقط/i.test(text),'production_root_is_preview_only');
    must(/login|sign in|تسجيل الدخول/i.test(text),'production_root_has_no_login_entry');
    return {status:r.status};
  });
  await step('AUTH unauthenticated session returns 401',async()=>{const r=await pilot('/api/auth/session');must(r.response.status===401&&r.payload?.authenticated===false,'unexpected_session');return{status:401};});
  await step('AUTH invalid credentials fail closed',async()=>{const r=await pilot('/api/auth/login',{method:'POST',body:{email:`invalid-${runId}@example.invalid`,password:'not-a-valid-password-123!'}});must(r.response.status===401,'invalid_login_not_denied');return{status:401};});
  await step('AUTH owner signup + verification + login + session',async()=>{owner=await createUser('owner');return{verified:true,authenticated:true};},{fatal:true});
  await step('AUTH employee signup + verification + login + session',async()=>{employee=await createUser('employee');return{verified:true,authenticated:true};},{fatal:true});
  await step('AUTH refresh token rotates',async()=>{const before=owner.jar.get('__Host-pilot_refresh');const r=await pilot('/api/auth/refresh',{method:'POST',body:{},jar:owner.jar});const after=owner.jar.get('__Host-pilot_refresh');must(r.response.status===200&&r.payload?.authenticated&&after&&after!==before,'refresh_rotation_failed');owner.token=owner.jar.get('__Host-pilot_access');return{rotated:true};});

  await step('OWNER creates business A',async()=>{const r=await rest(owner.token,'pilot_businesses',{method:'POST',body:{slug:`e2e-a-${runId}`.replace(/[^a-z0-9-]/g,'').slice(0,60),name:'PILOT E2E Services',business_type:'services',owner_id:owner.id,locale:'ar-AE',demo_mode:true}});must(r.response.status===201,`business_${r.response.status}`);businessA=one(r.payload,'business');report.cleanup.business_ids.push(businessA.id);return{created:true};},{fatal:true});
  await step('OWNER claims owner membership',async()=>{const r=await rest(owner.token,'pilot_memberships',{method:'POST',body:{business_id:businessA.id,user_id:owner.id,role:'owner'}});must(r.response.status===201,'owner_membership_failed');return{role:'owner'};},{fatal:true});

  await step('EMPLOYEE creates independent business B',async()=>{const r=await rest(employee.token,'pilot_businesses',{method:'POST',body:{slug:`e2e-b-${runId}`.replace(/[^a-z0-9-]/g,'').slice(0,60),name:'PILOT E2E Second Tenant',business_type:'services',owner_id:employee.id,locale:'en',demo_mode:true}});must(r.response.status===201,'business_b_failed');businessB=one(r.payload,'business_b');report.cleanup.business_ids.push(businessB.id);const m=await rest(employee.token,'pilot_memberships',{method:'POST',body:{business_id:businessB.id,user_id:employee.id,role:'owner'}});must(m.response.status===201,'business_b_membership_failed');return{created:true};},{fatal:true});
  await step('TENANT isolation owner A cannot read business B',async()=>{const r=await rest(owner.token,`pilot_businesses?id=eq.${businessB.id}&select=id`);must(r.response.status===200&&r.payload.length===0,'cross_tenant_read_visible');return{isolated:true};});
  await step('OWNER adds employee as STAFF',async()=>{const r=await rest(owner.token,'pilot_memberships',{method:'POST',body:{business_id:businessA.id,user_id:employee.id,role:'staff'}});must(r.response.status===201,'add_staff_failed');return{role:'staff'};});
  await step('STAFF session sees A and owned B only',async()=>{const s=await pilot('/api/auth/session',{jar:employee.jar});must(s.response.status===200,'employee_session_failed');const a=s.payload.memberships.find(m=>m.business_id===businessA.id);const b=s.payload.memberships.find(m=>m.business_id===businessB.id);must(a?.role==='staff'&&b?.role==='owner','membership_roles_wrong');return{membership_count:s.payload.memberships.length};});

  await step('OWNER updates business settings',async()=>{const r=await rest(owner.token,`pilot_businesses?id=eq.${businessA.id}`,{method:'PATCH',body:{name:'PILOT E2E Services Updated',locale:'en'}});must(r.response.status===200&&one(r.payload,'business_update').locale==='en','business_update_failed');return{updated:true};});
  await step('OWNER creates/updates service',async()=>{let r=await rest(owner.token,'pilot_services',{method:'POST',body:{business_id:businessA.id,name:'E2E Consultation',duration_minutes:30,active:true,metadata:{synthetic:true}}});must(r.response.status===201,'service_create_failed');service=one(r.payload,'service');r=await rest(owner.token,`pilot_services?id=eq.${service.id}`,{method:'PATCH',body:{duration_minutes:45}});must(r.response.status===200&&one(r.payload,'service_update').duration_minutes===45,'service_update_failed');return{created:true,updated:true};});
  await step('OWNER creates/updates customer',async()=>{let r=await rest(owner.token,'pilot_customers',{method:'POST',body:{business_id:businessA.id,display_name:'Synthetic Customer',channel_handle:`synthetic-${runId}`,lead_status:'new',metadata:{synthetic:true}}});must(r.response.status===201,'customer_create_failed');customer=one(r.payload,'customer');r=await rest(owner.token,`pilot_customers?id=eq.${customer.id}`,{method:'PATCH',body:{lead_status:'qualified'}});must(r.response.status===200&&one(r.payload,'customer_update').lead_status==='qualified','customer_update_failed');return{created:true,updated:true};});
  await step('OWNER manages customer lifecycle',async()=>{let r=await rest(owner.token,'pilot_customer_management',{method:'POST',body:{business_id:businessA.id,customer_id:customer.id,lifecycle_stage:'qualified',lead_score:85,sentiment:'positive',primary_need:'appointment',next_best_action:'book',memory:{synthetic:true}}});must(r.response.status===201,'customer_management_create_failed');const row=one(r.payload,'customer_management');r=await rest(owner.token,`pilot_customer_management?id=eq.${row.id}`,{method:'PATCH',body:{lifecycle_stage:'active',lead_score:90}});must(r.response.status===200,'customer_management_update_failed');return{managed:true};});
  await step('OWNER creates conversation + immutable message',async()=>{let r=await rest(owner.token,'pilot_conversations',{method:'POST',body:{business_id:businessA.id,customer_id:customer.id,channel_type:'web',state:'ai_active',demo_mode:true}});must(r.response.status===201,'conversation_create_failed');conversation=one(r.payload,'conversation');r=await rest(owner.token,'pilot_messages',{method:'POST',body:{business_id:businessA.id,conversation_id:conversation.id,sender_type:'customer',body:'ابا موعد باجر العصر',intent:'APPOINTMENT_REQUEST',simulated:true}});must(r.response.status===201,'message_create_failed');const msg=one(r.payload,'message');await expectDenied(await rest(owner.token,`pilot_messages?id=eq.${msg.id}`,{method:'PATCH',body:{body:'tampered'}}),'message_update');return{created:true,immutable:true};});
  await step('OWNER creates/cancels appointment',async()=>{let r=await rest(owner.token,'pilot_appointments',{method:'POST',body:{business_id:businessA.id,customer_id:customer.id,service_id:service.id,starts_at:new Date(Date.now()+86400000).toISOString(),status:'requested',simulated:true}});must(r.response.status===201,'appointment_create_failed');const a=one(r.payload,'appointment');r=await rest(owner.token,`pilot_appointments?id=eq.${a.id}`,{method:'PATCH',body:{status:'cancelled'}});must(r.response.status===200&&one(r.payload,'appointment_update').status==='cancelled','appointment_cancel_failed');return{created:true,cancelled:true};});
  await step('OWNER creates follow-up automation candidate',async()=>{const r=await rest(owner.token,'pilot_followups',{method:'POST',body:{business_id:businessA.id,conversation_id:conversation.id,customer_id:customer.id,channel_type:'web',reason:'E2E follow-up',status:'CANDIDATE',confidence:0.9,policy_state:'NOT_CHECKED',consent_state:'UNKNOWN',channel_policy_state:'UNKNOWN',quiet_hours_state:'UNKNOWN',metadata:{synthetic:true}}});must(r.response.status===201,'followup_create_failed');return{created:true};});
  await step('OWNER creates/updates automation policy',async()=>{let r=await rest(owner.token,'pilot_action_policies',{method:'POST',body:{business_id:businessA.id,action_key:`e2e_followup_${runId}`.slice(0,90),risk_class:'LOW',auto_execute:true,requires_customer_confirmation:false,requires_owner_approval:false,requires_identity_verification:false,max_attempts:2,timeout_seconds:15,active:true,metadata:{synthetic:true}}});must(r.response.status===201,'action_policy_create_failed');const p=one(r.payload,'action_policy');r=await rest(owner.token,`pilot_action_policies?business_id=eq.${businessA.id}&action_key=eq.${encodeURIComponent(p.action_key)}`,{method:'PATCH',body:{max_attempts:3}});must(r.response.status===200,'action_policy_update_failed');return{managed:true};});
  await step('OWNER manages business knowledge',async()=>{let r=await rest(owner.token,'pilot_business_knowledge',{method:'POST',body:{business_id:businessA.id,knowledge_key:`hours_${runId}`,knowledge_type:'fact',value:{hours:'09:00-18:00'},source:'owner_approved',confidence:1,status:'approved'}});must(r.response.status===201,'knowledge_create_failed');const k=one(r.payload,'knowledge');r=await rest(owner.token,`pilot_business_knowledge?id=eq.${k.id}`,{method:'PATCH',body:{value:{hours:'10:00-18:00'}}});must(r.response.status===200,'knowledge_update_failed');return{managed:true};});

  await step('OWNER creates product/inventory/order',async()=>{let r=await rest(owner.token,'pilot_products',{method:'POST',body:{business_id:businessA.id,sku:`E2E-${runId}`.slice(0,80),name:'Synthetic Product',price_aed:50,active:true,metadata:{synthetic:true}}});must(r.response.status===201,'product_create_failed');product=one(r.payload,'product');r=await rest(owner.token,'pilot_inventory',{method:'POST',body:{business_id:businessA.id,product_id:product.id,quantity:10,reserved:0}});must(r.response.status===201,'inventory_create_failed');r=await rest(owner.token,'pilot_orders',{method:'POST',body:{business_id:businessA.id,customer_id:customer.id,status:'draft',total_aed:50,simulated:true}});must(r.response.status===201,'order_create_failed');return{catalog:true,inventory:true,order:true};});

  await step('OWNER configures channel as CONFIGURED',async()=>{const r=await rest(owner.token,'pilot_channels',{method:'POST',body:{business_id:businessA.id,channel_type:'web',status:'configured',metadata:{synthetic:true}}});must(r.response.status===201,'channel_create_failed');channel=one(r.payload,'channel');return{status:'configured'};});
  await step('SECURITY client cannot self-declare channel CONNECTED',async()=>{await expectDenied(await rest(owner.token,`pilot_channels?id=eq.${channel.id}`,{method:'PATCH',body:{status:'connected'}}),'client_connected_state');return{denied:true};});

  await step('PRIVACY owner submits export request but cannot complete it',async()=>{let r=await rest(owner.token,'pilot_privacy_requests',{method:'POST',body:{business_id:businessA.id,request_type:'BUSINESS_EXPORT',status:'REQUESTED',requested_by:owner.id,correlation_id:`e2e:${runId}`,request_scope:{synthetic:true}}});must(r.response.status===201,'privacy_request_failed');const p=one(r.payload,'privacy_request');await expectDenied(await rest(owner.token,`pilot_privacy_requests?id=eq.${p.id}`,{method:'PATCH',body:{status:'COMPLETED'}}),'privacy_completion');return{protected:true};});

  await step('STAFF can edit customer and manage appointment',async()=>{let r=await rest(employee.token,`pilot_customers?id=eq.${customer.id}`,{method:'PATCH',body:{lead_status:'contacted'}});must(r.response.status===200,'staff_customer_edit_failed');r=await rest(employee.token,'pilot_appointments',{method:'POST',body:{business_id:businessA.id,customer_id:customer.id,service_id:service.id,starts_at:new Date(Date.now()+172800000).toISOString(),status:'requested',simulated:true}});must(r.response.status===201,'staff_appointment_failed');return{allowed:true};});
  await step('STAFF cannot manage team/integrations/automations',async()=>{await expectDenied(await rest(employee.token,`pilot_memberships?business_id=eq.${businessA.id}&user_id=eq.${owner.id}`,{method:'PATCH',body:{role:'viewer'}}),'staff_team');await expectDenied(await rest(employee.token,`pilot_channels?id=eq.${channel.id}`,{method:'PATCH',body:{status:'failed'}}),'staff_integrations');await expectDenied(await rest(employee.token,'pilot_action_policies',{method:'POST',body:{business_id:businessA.id,action_key:`staff_should_fail_${runId}`,risk_class:'LOW',auto_execute:true}}),'staff_automation');return{denied:true};});

  await step('OWNER changes employee to VIEWER',async()=>{const r=await rest(owner.token,`pilot_memberships?business_id=eq.${businessA.id}&user_id=eq.${employee.id}`,{method:'PATCH',body:{role:'viewer'}});must(r.response.status===200&&one(r.payload,'viewer_role').role==='viewer','viewer_role_failed');return{role:'viewer'};});
  await step('VIEWER is read-only for customers/services',async()=>{let r=await rest(employee.token,`pilot_customers?id=eq.${customer.id}&select=id,display_name`);must(r.response.status===200&&r.payload.length===1,'viewer_customer_read_failed');await expectDenied(await rest(employee.token,'pilot_customers',{method:'POST',body:{business_id:businessA.id,display_name:'Should Fail',lead_status:'new'}}),'viewer_customer_write');await expectDenied(await rest(employee.token,'pilot_services',{method:'POST',body:{business_id:businessA.id,name:'Should Fail',duration_minutes:15}}),'viewer_service_write');return{read:true,writes_denied:true};});
  await step('SECURITY VIEWER cannot mutate products/inventory/orders',async()=>{await expectDenied(await rest(employee.token,`pilot_products?id=eq.${product.id}`,{method:'PATCH',body:{price_aed:1}}),'viewer_product_write');await expectDenied(await rest(employee.token,`pilot_inventory?business_id=eq.${businessA.id}&product_id=eq.${product.id}`,{method:'PATCH',body:{quantity:999}}),'viewer_inventory_write');await expectDenied(await rest(employee.token,'pilot_orders',{method:'POST',body:{business_id:businessA.id,customer_id:customer.id,status:'draft',total_aed:1,simulated:true}}),'viewer_order_write');return{denied:true};});

  await step('OWNER changes employee to MANAGER',async()=>{const r=await rest(owner.token,`pilot_memberships?business_id=eq.${businessA.id}&user_id=eq.${employee.id}`,{method:'PATCH',body:{role:'manager'}});must(r.response.status===200&&one(r.payload,'manager_role').role==='manager','manager_role_failed');return{role:'manager'};});
  await step('MANAGER manages services/automation but not team/integration',async()=>{let r=await rest(employee.token,'pilot_services',{method:'POST',body:{business_id:businessA.id,name:'Manager Service',duration_minutes:20,active:true,metadata:{synthetic:true}}});must(r.response.status===201,'manager_service_failed');r=await rest(employee.token,'pilot_action_policies',{method:'POST',body:{business_id:businessA.id,action_key:`manager_auto_${runId}`,risk_class:'LOW',auto_execute:true,metadata:{synthetic:true}}});must(r.response.status===201,'manager_automation_failed');await expectDenied(await rest(employee.token,`pilot_memberships?business_id=eq.${businessA.id}&user_id=eq.${owner.id}`,{method:'PATCH',body:{role:'viewer'}}),'manager_team');await expectDenied(await rest(employee.token,`pilot_channels?id=eq.${channel.id}`,{method:'PATCH',body:{status:'failed'}}),'manager_integration');return{allowed_expected:true,denied_expected:true};});

  await step('OWNER changes employee to ADMIN',async()=>{const r=await rest(owner.token,`pilot_memberships?business_id=eq.${businessA.id}&user_id=eq.${employee.id}`,{method:'PATCH',body:{role:'admin'}});must(r.response.status===200&&one(r.payload,'admin_role').role==='admin','admin_role_failed');return{role:'admin'};});
  await step('ADMIN manages integrations but cannot elevate self to OWNER',async()=>{let r=await rest(employee.token,`pilot_channels?id=eq.${channel.id}`,{method:'PATCH',body:{status:'configured'}});must(r.response.status===200,'admin_integration_failed');await expectDenied(await rest(employee.token,`pilot_memberships?business_id=eq.${businessA.id}&user_id=eq.${employee.id}`,{method:'PATCH',body:{role:'owner'}}),'admin_owner_escalation');return{integration:true,owner_protected:true};});
  await step('OWNER cannot delete own owner membership',async()=>{await expectDenied(await rest(owner.token,`pilot_memberships?business_id=eq.${businessA.id}&user_id=eq.${owner.id}`,{method:'DELETE'}),'owner_self_delete');return{protected:true};});
  await step('AUTH logout revokes visible session and re-login works',async()=>{let r=await pilot('/api/auth/logout',{method:'POST',body:{},jar:owner.jar});must(r.response.status===200,'logout_failed');r=await pilot('/api/auth/session',{jar:owner.jar});must(r.response.status===401,'logout_session_survived');r=await pilot('/api/auth/login',{method:'POST',body:{email:owner.box.address,password:owner.password},jar:owner.jar});must(r.response.status===200&&r.payload?.authenticated,'relogin_failed');owner.token=owner.jar.get('__Host-pilot_access');return{revoked:true,relogin:true};});
  await step('OWNER removes employee from business A',async()=>{const r=await rest(owner.token,`pilot_memberships?business_id=eq.${businessA.id}&user_id=eq.${employee.id}`,{method:'DELETE'});must([200,204].includes(r.response.status),'remove_employee_failed');return{removed:true};});
  await step('REMOVED employee loses access to business A but keeps own B',async()=>{const a=await rest(employee.token,`pilot_businesses?id=eq.${businessA.id}&select=id`);const b=await rest(employee.token,`pilot_businesses?id=eq.${businessB.id}&select=id`);must(a.response.status===200&&a.payload.length===0,'removed_employee_still_accesses_a');must(b.response.status===200&&b.payload.length===1,'employee_lost_owned_b');return{a_denied:true,b_retained:true};});
} catch(error) { fatal=error; }
finally {
  for(const box of mailboxes){try{await mail(`/accounts/${box.id}`,{method:'DELETE'},box.token);}catch{}}
  report.finished_at=new Date().toISOString();
  report.summary={passed:report.steps.filter(s=>s.ok).length,failed:report.steps.filter(s=>!s.ok).length,fatal:fatal?safeError(fatal):null};
  fs.writeFileSync('e2e-report-v3.json',JSON.stringify(report,null,2));
  console.log(`E2E_SUMMARY passed=${report.summary.passed} failed=${report.summary.failed}${report.summary.fatal?' fatal='+report.summary.fatal:''}`);
  console.log(`E2E_CLEANUP users=${report.cleanup.user_ids.join(',')} businesses=${report.cleanup.business_ids.join(',')}`);
}
if(fatal||report.summary.failed>0) process.exitCode=1;
