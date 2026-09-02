import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  readJsonBody,
  requireSameOrigin,
  supabaseRest,
} from './_auth-core.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean=(value,max=240)=>String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
const safeId=value=>UUID_RE.test(clean(value,60))?clean(value,60):null;
const enc=value=>encodeURIComponent(String(value));
const queryValue=(req,key)=>{try{const values=new URL(String(req?.url||'/'),'https://dabbir.invalid').searchParams.getAll(key);return values.length===1?values[0]:null}catch{return null}};
const number=(value,{min=0,max=1e7,fallback=0}={})=>{const n=Number(value);return Number.isFinite(n)&&n>=min&&n<=max?n:fallback};
const isoDate=(value)=>{const d=new Date(value);return Number.isNaN(d.getTime())?null:d.toISOString()};

async function readData(response,fallback){
  const text=await response.text();let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=null}
  if(!response.ok){const error=new Error(payload?.message||payload?.code||fallback);error.status=response.status;throw error}
  return payload;
}
const rest=(token,path,options={},fallback='CLINIC_REQUEST_FAILED')=>supabaseRest(path,token,options).then(r=>readData(r,fallback));

async function context(req,res){
  const token=accessTokenFromRequest(req);
  if(!token){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  const [user,memberships]=await Promise.all([
    getVerifiedUser(token).catch(()=>null),
    getBusinessMemberships(token).catch(()=>[]),
  ]);
  if(!user){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  return {token,user,memberships};
}
function membershipFor(ctx,businessId){return ctx.memberships.find(m=>m.business_id===businessId&&m.status==='active')||null}
function canOperate(m){return ['owner','admin','manager','employee','staff'].includes(String(m?.role||'').toLowerCase())}
function canManage(m){return ['owner','admin','manager'].includes(String(m?.role||'').toLowerCase())}
function canAdmin(m){return ['owner','admin'].includes(String(m?.role||'').toLowerCase())}

async function verifyClinic(ctx,businessId){
  const rows=await rest(ctx.token,`dabbir_businesses?select=id,name,business_type,locale&id=eq.${enc(businessId)}&limit=1`,{},'BUSINESS_LOOKUP_FAILED');
  const business=rows?.[0]||null;
  if(!business)throw Object.assign(new Error('BUSINESS_NOT_FOUND'),{status:404});
  if(business.business_type!=='clinic')throw Object.assign(new Error('CLINIC_MODE_REQUIRED'),{status:409});
  return business;
}
async function patientGate(ctx,businessId){
  const rows=await rest(ctx.token,`dabbir_patient_data_gate?select=business_id,patient_data_mode,legal_review_status,privacy_review_status,security_review_status,production_patient_data_allowed&business_id=eq.${enc(businessId)}&limit=1`,{},'PATIENT_GATE_LOOKUP_FAILED');
  return rows?.[0]||{patient_data_mode:'SYNTHETIC_ONLY',production_patient_data_allowed:false};
}

async function snapshot(ctx,businessId){
  const [business,gate,settings,devices,packages,sessions,templates,appointments,customers,services,workers,consents]=await Promise.all([
    verifyClinic(ctx,businessId),
    patientGate(ctx,businessId),
    rest(ctx.token,`dabbir_clinic_settings?select=business_id,timezone,default_next_session_days,next_session_reminder_days_before,require_service_consent,updated_at&business_id=eq.${enc(businessId)}&limit=1`,{},'CLINIC_SETTINGS_FAILED'),
    rest(ctx.token,`dabbir_clinic_devices?select=id,name,model,device_type,active,metadata,created_at,updated_at&business_id=eq.${enc(businessId)}&order=active.desc,name.asc&limit=100`,{},'CLINIC_DEVICES_FAILED'),
    rest(ctx.token,`dabbir_clinic_packages?select=id,customer_id,service_id,package_name,total_sessions,used_sessions,price_aed,status,starts_at,expires_at,metadata,created_at,updated_at&business_id=eq.${enc(businessId)}&order=updated_at.desc&limit=500`,{},'CLINIC_PACKAGES_FAILED'),
    rest(ctx.token,`dabbir_clinic_sessions?select=id,appointment_id,customer_id,service_id,worker_id,device_id,package_id,session_type,treatment_area,session_number,device_settings,notes_before,notes_after,next_session_at,status,created_at,updated_at&business_id=eq.${enc(businessId)}&order=created_at.desc&limit=500`,{},'CLINIC_SESSIONS_FAILED'),
    rest(ctx.token,`dabbir_clinic_consent_templates?select=id,title_ar,title_en,body_ar,body_en,version,active,created_at,updated_at&business_id=eq.${enc(businessId)}&order=active.desc,updated_at.desc&limit=100`,{},'CLINIC_CONSENT_TEMPLATES_FAILED'),
    rest(ctx.token,`dabbir_appointments?select=id,customer_id,service_id,worker_id,starts_at,ends_at,status,simulated,quoted_price_aed,discount_aed,notes,booking_source,payment_status,created_at,updated_at&business_id=eq.${enc(businessId)}&order=starts_at.desc&limit=1000`,{},'CLINIC_APPOINTMENTS_FAILED'),
    rest(ctx.token,`dabbir_customers?select=id,display_name,phone_e164,metadata,created_at,updated_at&business_id=eq.${enc(businessId)}&order=updated_at.desc&limit=500`,{},'CLINIC_CUSTOMERS_FAILED'),
    rest(ctx.token,`dabbir_services?select=id,name,name_ar,name_en,category,price_aed,duration_minutes,active,metadata&business_id=eq.${enc(businessId)}&order=active.desc,name.asc&limit=300`,{},'CLINIC_SERVICES_FAILED'),
    rest(ctx.token,`dabbir_workers?select=id,display_name,job_title,status,metadata,created_at,updated_at&business_id=eq.${enc(businessId)}&order=display_name.asc&limit=100`,{},'CLINIC_WORKERS_FAILED'),
    rest(ctx.token,`dabbir_customer_consents?select=id,customer_id,purpose,status,source,evidence_ref,captured_at,withdrawn_at,metadata,updated_at&business_id=eq.${enc(businessId)}&purpose=eq.SERVICE_DELIVERY&order=updated_at.desc&limit=500`,{},'CLINIC_CONSENTS_FAILED'),
  ]);
  return {
    ok:true,mode:'clinic',business,patient_data_gate:gate,
    settings:settings?.[0]||null,devices,packages,sessions,consent_templates:templates,
    appointments,customers,services,workers,consents,
  };
}

async function saveDevice(ctx,businessId,body){
  const deviceId=safeId(body.device_id);
  const payload={
    business_id:businessId,
    name:clean(body.name,120),
    model:clean(body.model,120),
    device_type:['laser','aesthetic','other'].includes(body.device_type)?body.device_type:'laser',
    active:body.active!==false,
    metadata:body.metadata&&typeof body.metadata==='object'?body.metadata:{},
    updated_at:new Date().toISOString(),
  };
  if(!payload.name)return {status:400,body:{ok:false,error:'DEVICE_NAME_REQUIRED'}};
  const path=deviceId?`dabbir_clinic_devices?business_id=eq.${enc(businessId)}&id=eq.${enc(deviceId)}&select=*`:'dabbir_clinic_devices?select=*';
  const options=deviceId
    ?{method:'PATCH',headers:{prefer:'return=representation'},body:JSON.stringify(payload)}
    :{method:'POST',headers:{prefer:'return=representation'},body:JSON.stringify(payload)};
  const rows=await rest(ctx.token,path,options,'DEVICE_SAVE_FAILED');
  return {status:deviceId?200:201,body:{ok:true,device:rows?.[0]||null}};
}

async function savePackage(ctx,businessId,body){
  const packageId=safeId(body.package_id),customerId=safeId(body.customer_id),serviceId=safeId(body.service_id);
  if(!customerId||!serviceId)return {status:400,body:{ok:false,error:'CUSTOMER_AND_SERVICE_REQUIRED'}};
  const total=number(body.total_sessions,{min:1,max:100,fallback:0});
  if(!total)return {status:400,body:{ok:false,error:'TOTAL_SESSIONS_REQUIRED'}};
  const payload={
    business_id:businessId,customer_id:customerId,service_id:serviceId,
    package_name:clean(body.package_name,160),
    total_sessions:total,price_aed:number(body.price_aed,{min:0,max:1e7,fallback:0}),
    status:['active','completed','expired','cancelled'].includes(body.status)?body.status:'active',
    starts_at:clean(body.starts_at||new Date().toISOString().slice(0,10),10),
    expires_at:body.expires_at?clean(body.expires_at,10):null,
    metadata:body.metadata&&typeof body.metadata==='object'?body.metadata:{},
    updated_at:new Date().toISOString(),
  };
  if(!payload.package_name)return {status:400,body:{ok:false,error:'PACKAGE_NAME_REQUIRED'}};
  const path=packageId?`dabbir_clinic_packages?business_id=eq.${enc(businessId)}&id=eq.${enc(packageId)}&select=*`:'dabbir_clinic_packages?select=*';
  const options=packageId
    ?{method:'PATCH',headers:{prefer:'return=representation'},body:JSON.stringify(payload)}
    :{method:'POST',headers:{prefer:'return=representation'},body:JSON.stringify(payload)};
  const rows=await rest(ctx.token,path,options,'PACKAGE_SAVE_FAILED');
  return {status:packageId?200:201,body:{ok:true,package:rows?.[0]||null}};
}

async function saveConsentTemplate(ctx,businessId,body){
  const templateId=safeId(body.template_id);
  const payload={
    business_id:businessId,
    title_ar:clean(body.title_ar,160),
    title_en:clean(body.title_en,160),
    body_ar:clean(body.body_ar,12000),
    body_en:clean(body.body_en,12000),
    version:clean(body.version||'1.0',32),
    active:body.active!==false,
    updated_at:new Date().toISOString(),
  };
  if(!payload.title_ar||payload.body_ar.length<10)return {status:400,body:{ok:false,error:'CONSENT_TEMPLATE_REQUIRED'}};
  const path=templateId?`dabbir_clinic_consent_templates?business_id=eq.${enc(businessId)}&id=eq.${enc(templateId)}&select=*`:'dabbir_clinic_consent_templates?select=*';
  const options=templateId
    ?{method:'PATCH',headers:{prefer:'return=representation'},body:JSON.stringify(payload)}
    :{method:'POST',headers:{prefer:'return=representation'},body:JSON.stringify(payload)};
  const rows=await rest(ctx.token,path,options,'CONSENT_TEMPLATE_SAVE_FAILED');
  return {status:templateId?200:201,body:{ok:true,template:rows?.[0]||null}};
}

async function recordConsent(ctx,businessId,body){
  const customerId=safeId(body.customer_id),templateId=safeId(body.template_id),appointmentId=safeId(body.appointment_id);
  if(!customerId||!templateId)return {status:400,body:{ok:false,error:'CUSTOMER_AND_CONSENT_TEMPLATE_REQUIRED'}};
  const templates=await rest(ctx.token,`dabbir_clinic_consent_templates?select=id,title_ar,version&business_id=eq.${enc(businessId)}&id=eq.${enc(templateId)}&active=eq.true&limit=1`,{},'CONSENT_TEMPLATE_LOOKUP_FAILED');
  const template=templates?.[0];if(!template)return {status:404,body:{ok:false,error:'CONSENT_TEMPLATE_NOT_FOUND'}};
  const granted=body.granted!==false,now=new Date().toISOString();
  const payload={
    business_id:businessId,customer_id:customerId,purpose:'SERVICE_DELIVERY',
    status:granted?'GRANTED':'WITHDRAWN',source:'CUSTOMER',
    evidence_ref:clean(body.evidence_ref||`clinic-consent:${templateId}:${template.version}`,512),
    captured_at:granted?now:null,withdrawn_at:granted?null:now,
    metadata:{clinic:true,template_id:templateId,template_version:template.version,template_title:template.title_ar,appointment_id:appointmentId||null},
    updated_at:now,
  };
  const rows=await rest(ctx.token,'dabbir_customer_consents?on_conflict=business_id,customer_id,purpose&select=*',{
    method:'POST',headers:{prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(payload)
  },'CONSENT_RECORD_FAILED');
  return {status:200,body:{ok:true,consent:rows?.[0]||null}};
}

async function scheduleNextReminder(ctx,businessId,{appointment,session,settings}){
  if(!session?.next_session_at||!appointment?.customer_id)return null;
  const next=new Date(session.next_session_at);
  if(Number.isNaN(next.getTime()))return null;
  const days=Number(settings?.next_session_reminder_days_before??1);
  const scheduled=new Date(next.getTime()-Math.max(0,days)*864e5);
  const when=scheduled.getTime()>Date.now()?scheduled:new Date(Date.now()+60000);
  const payload={
    business_id:businessId,appointment_id:appointment.id,customer_id:appointment.customer_id,
    channel:'internal',notification_type:'rebooking',template_language:'ar',
    scheduled_for:when.toISOString(),status:'pending',
    idempotency_key:`clinic-next-session:${session.id}:${session.next_session_at}`,
    payload:{clinic:true,session_id:session.id,next_session_at:session.next_session_at,treatment_area:session.treatment_area||''},
  };
  const rows=await rest(ctx.token,'dabbir_workflow_notifications?on_conflict=business_id,idempotency_key&select=id,notification_type,scheduled_for,status',{
    method:'POST',headers:{prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(payload)
  },'NEXT_SESSION_REMINDER_FAILED');
  return rows?.[0]||null;
}

async function saveSession(ctx,businessId,body){
  const appointmentId=safeId(body.appointment_id);
  if(!appointmentId)return {status:400,body:{ok:false,error:'APPOINTMENT_ID_REQUIRED'}};
  const appointments=await rest(ctx.token,`dabbir_appointments?select=id,customer_id,service_id,worker_id,simulated,status&business_id=eq.${enc(businessId)}&id=eq.${enc(appointmentId)}&limit=1`,{},'APPOINTMENT_LOOKUP_FAILED');
  const appointment=appointments?.[0];if(!appointment)return {status:404,body:{ok:false,error:'APPOINTMENT_NOT_FOUND'}};

  const gate=await patientGate(ctx,businessId);
  if(!appointment.simulated&&!gate.production_patient_data_allowed){
    return {status:409,body:{ok:false,error:'PATIENT_DATA_GATE_CLOSED',patient_data_mode:gate.patient_data_mode}};
  }

  const packageId=safeId(body.package_id),deviceId=safeId(body.device_id);
  if(packageId){
    const packages=await rest(ctx.token,`dabbir_clinic_packages?select=id,customer_id,service_id,status,total_sessions,used_sessions&business_id=eq.${enc(businessId)}&id=eq.${enc(packageId)}&limit=1`,{},'PACKAGE_LOOKUP_FAILED');
    const pkg=packages?.[0];
    if(!pkg||pkg.customer_id!==appointment.customer_id||pkg.service_id!==appointment.service_id||pkg.status!=='active'){
      return {status:409,body:{ok:false,error:'PACKAGE_NOT_VALID_FOR_APPOINTMENT'}};
    }
  }
  if(deviceId){
    const devices=await rest(ctx.token,`dabbir_clinic_devices?select=id,active&business_id=eq.${enc(businessId)}&id=eq.${enc(deviceId)}&limit=1`,{},'DEVICE_LOOKUP_FAILED');
    if(!devices?.[0]?.active)return {status:409,body:{ok:false,error:'DEVICE_NOT_AVAILABLE'}};
  }

  const nextSessionAt=body.next_session_at?isoDate(body.next_session_at):null;
  if(body.next_session_at&&!nextSessionAt)return {status:400,body:{ok:false,error:'INVALID_NEXT_SESSION_DATE'}};
  const settingsNotes=clean(body.device_settings_notes,3000);
  const payload={
    business_id:businessId,appointment_id:appointmentId,customer_id:appointment.customer_id,
    service_id:appointment.service_id,worker_id:appointment.worker_id||safeId(body.worker_id),
    device_id:deviceId,package_id:packageId,
    session_type:['consultation','test_patch','treatment','follow_up','maintenance','other'].includes(body.session_type)?body.session_type:'treatment',
    treatment_area:clean(body.treatment_area,240),
    device_settings:{notes:settingsNotes},
    notes_before:clean(body.notes_before,4000),notes_after:clean(body.notes_after,4000),
    next_session_at:nextSessionAt,
    status:['planned','in_progress','completed','cancelled'].includes(body.status)?body.status:'completed',
    created_by:ctx.user.id,updated_at:new Date().toISOString(),
  };
  const rows=await rest(ctx.token,'dabbir_clinic_sessions?on_conflict=business_id,appointment_id&select=*',{
    method:'POST',headers:{prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(payload)
  },'CLINIC_SESSION_SAVE_FAILED');
  const session=rows?.[0]||null;
  const settingsRows=await rest(ctx.token,`dabbir_clinic_settings?select=next_session_reminder_days_before&business_id=eq.${enc(businessId)}&limit=1`,{},'CLINIC_SETTINGS_FAILED').catch(()=>[]);
  const reminder=await scheduleNextReminder(ctx,businessId,{appointment,session,settings:settingsRows?.[0]}).catch(()=>null);
  return {status:200,body:{ok:true,session,reminder,patient_data_gate:gate}};
}

async function saveSettings(ctx,businessId,body){
  const payload={
    business_id:businessId,
    timezone:clean(body.timezone||'Asia/Dubai',80),
    default_next_session_days:number(body.default_next_session_days,{min:1,max:365,fallback:28}),
    next_session_reminder_days_before:number(body.next_session_reminder_days_before,{min:0,max:30,fallback:1}),
    require_service_consent:body.require_service_consent!==false,
    updated_at:new Date().toISOString(),
  };
  const rows=await rest(ctx.token,'dabbir_clinic_settings?on_conflict=business_id&select=*',{
    method:'POST',headers:{prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(payload)
  },'CLINIC_SETTINGS_SAVE_FAILED');
  return {status:200,body:{ok:true,settings:rows?.[0]||null}};
}

async function handlePost(ctx,businessId,membership,body){
  await verifyClinic(ctx,businessId);
  if(!canOperate(membership))return {status:403,body:{ok:false,error:'CLINIC_MANAGEMENT_REQUIRED'}};
  const action=clean(body.action,60);
  if(action==='save_session')return saveSession(ctx,businessId,body);
  if(action==='save_package')return savePackage(ctx,businessId,body);
  if(action==='record_consent')return recordConsent(ctx,businessId,body);
  if(action==='save_device'){
    if(!canManage(membership))return {status:403,body:{ok:false,error:'CLINIC_MANAGER_REQUIRED'}};
    return saveDevice(ctx,businessId,body);
  }
  if(action==='save_consent_template'){
    if(!canAdmin(membership))return {status:403,body:{ok:false,error:'CLINIC_ADMIN_REQUIRED'}};
    return saveConsentTemplate(ctx,businessId,body);
  }
  if(action==='save_settings'){
    if(!canAdmin(membership))return {status:403,body:{ok:false,error:'CLINIC_ADMIN_REQUIRED'}};
    return saveSettings(ctx,businessId,body);
  }
  return {status:400,body:{ok:false,error:'UNSUPPORTED_CLINIC_ACTION'}};
}

export default async function handler(req,res){
  const ctx=await context(req,res);if(!ctx)return;
  try{
    if(!['GET','POST'].includes(req.method))return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
    if(req.method==='POST'&&!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
    const body=req.method==='POST'?await readJsonBody(req):null;
    const businessId=safeId(req.method==='GET'?queryValue(req,'business_id'):body?.business_id);
    if(!businessId)return json(res,400,{ok:false,error:'BUSINESS_ID_REQUIRED'});
    const membership=membershipFor(ctx,businessId);if(!membership)return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});
    if(req.method==='GET')return json(res,200,await snapshot(ctx,businessId));
    const result=await handlePost(ctx,businessId,membership,body||{});
    return json(res,result.status,result.body);
  }catch(error){
    const message=clean(error?.message||'CLINIC_OPERATION_FAILED',180);
    const raw=Number(error?.status||500);
    const status=[400,401,403,404,409,413,429,500,502,503].includes(raw)?raw:(/GATE|CONFLICT|CLINIC_MODE/.test(message)?409:500);
    console.error('dabbir_clinic_operation_failed',{status,error:message});
    return json(res,status,{ok:false,error:message});
  }
}
