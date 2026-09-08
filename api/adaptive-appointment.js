import {accessTokenFromRequest,getBusinessMemberships,getVerifiedUser,json,readJsonBody,requireSameOrigin,supabaseRest} from './_auth-core.js';
import {branchWrite,resolveBranchScope} from './_branch-scope.js';
import {createHash} from 'node:crypto';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean=(v,n=500)=>String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,n);
const messages={
 AUTH_REQUIRED:['انتهت الجلسة. سجّل الدخول ثم حاول مجددًا.','Your session expired. Sign in and try again.'],
 ORIGIN_REQUIRED:['تعذر التحقق من الطلب. حدّث الصفحة ثم حاول مجددًا.','The request could not be verified. Refresh the page and try again.'],
 BUSINESS_ACCESS_DENIED:['ليس لديك صلاحية إنشاء موعد لهذا النشاط.','You cannot create an appointment for this business.'],
 BUSINESS_NOT_FOUND:['تعذر العثور على النشاط. حدّث الصفحة واختر نشاطك.','The business could not be found. Refresh the page and select your business.'],
 ACTIVE_BRANCH_REQUIRED:['لا يوجد فرع نشط للحجز. فعّل فرعًا من الإعدادات.','No active branch is available. Activate a branch in settings.'],
 SELECTED_BRANCH_REQUIRED:['اختر فرعًا محددًا من نطاق الفرع قبل حفظ الموعد.','Select a specific branch before saving the appointment.'],
 BRANCH_SELECTION_REQUIRED:['اختر فرعًا محددًا من نطاق الفرع قبل حفظ الموعد.','Select a specific branch before saving the appointment.'],
 INVALID_BRANCH_ID:['الفرع المحدد غير صالح. حدّث الصفحة واختر الفرع مجددًا.','The selected branch is invalid. Refresh the page and select it again.'],
 BRANCH_NOT_FOUND:['الفرع المحدد غير متاح لهذا النشاط. اختر فرعًا نشطًا.','This branch is unavailable for the business. Select an active branch.'],
 BRANCH_ACCESS_DENIED:['ليس لديك صلاحية الحجز في هذا الفرع. اختر فرعًا مسندًا إليك.','You cannot book in this branch. Select one assigned to you.'],
 BRANCH_ASSIGNMENT_REQUIRED:['لم يُسند إليك فرع للحجز. اطلب من صاحب النشاط تحديد فرعك.','No booking branch is assigned to you. Ask the owner to assign one.'],
 ALL_BRANCHES_ACCESS_DENIED:['اختر فرعًا مسندًا إليك بدل كل الفروع.','Select a branch assigned to you instead of all branches.'],
 BRANCH_LOOKUP_FAILED:['تعذر التحقق من الفرع. لم يُرسل الحجز؛ حاول مجددًا.','The branch could not be verified. The booking was not submitted; try again.'],
 BRANCH_ASSIGNMENTS_LOOKUP_FAILED:['تعذر التحقق من صلاحيات الفرع. لم يُرسل الحجز؛ حاول مجددًا.','Branch access could not be verified. The booking was not submitted; try again.'],
 APPOINTMENT_INPUT_REQUIRED:['أدخل اسم العميل ووقتًا صالحًا للموعد.','Enter the customer name and a valid appointment time.'],
 CUSTOMER_ID_INVALID:['العميل المحدد غير صالح. اختر العميل مجددًا.','The selected customer is invalid. Select the customer again.'],
 CUSTOMER_NOT_FOUND:['العميل المحدد غير متاح لهذا النشاط. اختر العميل مجددًا.','This customer is unavailable for the business. Select the customer again.'],
 APPOINTMENT_BRANCH_UNVERIFIED:['تعذر تأكيد فرع الموعد المحفوظ. راجع قائمة المواعيد قبل إعادة المحاولة.','The saved appointment branch could not be verified. Check appointments before retrying.'],
 APPOINTMENT_CREATE_UNVERIFIED:['تعذر تأكيد حفظ الموعد. راجع قائمة المواعيد قبل إعادة المحاولة.','The save could not be confirmed. Check appointments before retrying.'],
 APPOINTMENT_CREATE_FAILED:['تعذر حفظ الموعد. راجع بياناته وحاول مجددًا.','The appointment could not be saved. Check its details and try again.'],
 CUSTOMER_CREATE_FAILED:['تعذر حفظ بيانات العميل. حاول مجددًا.','The customer details could not be saved. Try again.'],
 CUSTOMER_CREATE_UNVERIFIED:['تعذر تأكيد حفظ بيانات العميل. راجع العملاء قبل إعادة المحاولة.','The customer save could not be confirmed. Check customers before retrying.'],
 CUSTOMER_LOOKUP_FAILED:['تعذر التحقق من العميل. حاول مجددًا.','The customer could not be verified. Try again.'],
 METHOD_NOT_ALLOWED:['طريقة الطلب غير متاحة. حدّث الصفحة.','This request method is unavailable. Refresh the page.'],
 INVALID_JSON:['تعذر قراءة بيانات الموعد. حدّث الصفحة وحاول مجددًا.','The appointment details could not be read. Refresh the page and try again.'],
 PAYLOAD_TOO_LARGE:['بيانات الموعد طويلة جدًا. اختصر الملاحظات وحاول مجددًا.','The appointment details are too long. Shorten the notes and try again.'],
 VALID_IDEMPOTENCY_KEY_REQUIRED:['تعذر تجهيز طلب الحفظ. حدّث الصفحة وحاول مجددًا.','The save request could not be prepared. Refresh the page and try again.'],
 IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_BOOKING:['تغيّرت بيانات طلب محفوظ سابقًا. افتح نموذج موعد جديد للبيانات الجديدة.','This request was already used with different details. Open a new appointment form for the new details.'],
 CUSTOMER_IDEMPOTENCY_CONFLICT:['تعذر مطابقة العميل بطلب الحفظ. راجع العملاء قبل إعادة المحاولة.','The customer could not be matched to this request. Check customers before retrying.'],
 APPOINTMENT_REPLAY_LOOKUP_FAILED:['تعذر التحقق من نتيجة الحفظ السابقة. حاول مجددًا من النموذج نفسه.','The previous save result could not be checked. Retry from the same form.'],
};
function fail(res,status,code){
 const error=Object.hasOwn(messages,code)?code:'APPOINTMENT_CREATE_FAILED';
 const [message_ar,message_en]=messages[error];
 return json(res,[400,401,403,404,405,409,413,429,500,502,503,504].includes(Number(status))?Number(status):500,{ok:false,error,message_ar,message_en});
}
const failure=(code,status=502,extra={})=>Object.assign(new Error(code),{status,...extra});
async function rest(token,path,opt={},msg='REQUEST_FAILED',unverified=msg){
 let response,text;
 try{response=await supabaseRest(path,token,opt);text=await response.text();}catch{throw failure(unverified);}
 let payload;try{payload=text?JSON.parse(text):null;}catch{}
 if(!response.ok)throw failure(msg,response.status,{uniqueConflict:response.status===409&&payload?.code==='23505'});
 if(!Array.isArray(payload))throw failure(unverified);
 return payload;
}
const APPOINTMENT_FIELDS='id,business_id,branch_id,customer_id,starts_at,ends_at,status,simulated,quoted_price_aed,notes,idempotency_key,idempotency_fingerprint';
function customerRequestId(businessId,actorId,key){
 // UUID v5 names a request deterministically; the separate SHA-256 fingerprint
 // checks its normalized booking intent before any existing customer is reused.
 const bytes=createHash('sha1').update(Buffer.from('45e648e9c8cd5c978d4e78a21a756b9d','hex')).update(JSON.stringify([businessId,actorId,key])).digest().subarray(0,16);
 bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;
 const hex=bytes.toString('hex');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
function appointmentResult(appointment,business,branchId,requestedCustomerId,replayed){
 const {idempotency_fingerprint,...visible}=appointment;
 return {ok:true,appointment:visible,branch_id:branchId,idempotent_replay:replayed,business_type:business.business_type,country_code:business.country_code,currency_code:business.currency_code,timezone:business.timezone,customer_reused:Boolean(requestedCustomerId)};
}
function e164(value,prefix){
 const raw=clean(value,40);if(!raw)return null;
 let compact=raw.replace(/[\s().-]/g,'');
 if(compact.startsWith('00'))compact='+'+compact.slice(2);
 if(/^\+[1-9]\d{7,14}$/.test(compact))return compact;
 const digits=compact.replace(/\D/g,'').replace(/^0+/, '');
 const country=String(prefix||'').replace(/\D/g,'');
 const normalized=country&&digits?`+${country}${digits}`:null;
 return normalized&&/^\+[1-9]\d{7,14}$/.test(normalized)?normalized:null;
}
export default async function handler(req,res){
 if(req.method!=='POST')return fail(res,405,'METHOD_NOT_ALLOWED');
 if(!requireSameOrigin(req))return fail(res,403,'ORIGIN_REQUIRED');
 try{
  const token=accessTokenFromRequest(req);if(!token)return fail(res,401,'AUTH_REQUIRED');
  const [user,memberships,body]=await Promise.all([getVerifiedUser(token),getBusinessMemberships(token),readJsonBody(req)]);if(!user)return fail(res,401,'AUTH_REQUIRED');
  const businessId=clean(body?.business_id,60);const membership=Array.isArray(memberships)?memberships.find(m=>m.business_id===businessId&&m.status==='active'):null;
  if(!UUID.test(businessId)||!membership)return fail(res,403,'BUSINESS_ACCESS_DENIED');
  const scope=await resolveBranchScope({businessId,membership,userId:user.id,requestedBranch:body.branch_id,fetchRows:(path,code)=>rest(token,path,{},code)});
  // A sole authorized active branch is unambiguous. Never guess the primary
  // branch when several branches are visible in the owner's all-branch view.
  const branchId=branchWrite(scope.mode==='all'&&scope.branch_ids.length===1?{...scope,mode:'selected',branch_id:scope.branch_ids[0]}:scope);
  const b=await rest(token,`dabbir_businesses?select=id,business_type,country_code,currency_code,timezone,phone_country_prefix&id=eq.${encodeURIComponent(businessId)}&limit=1`);const business=b?.[0];if(!business)return fail(res,404,'BUSINESS_NOT_FOUND');
  const name=clean(body.customer_name,120);const start=new Date(body.starts_at);if(!name||Number.isNaN(start.getTime()))return fail(res,400,'APPOINTMENT_INPUT_REQUIRED');
  const requestKey=clean(body.idempotency_key,60).toLowerCase();if(!UUID.test(requestKey))return fail(res,400,'VALID_IDEMPOTENCY_KEY_REQUIRED');
  const idempotencyKey='adaptive:'+requestKey;
  const d=body.details&&typeof body.details==='object'?body.details:{};const rawPhone=clean(d.phone,40)||null;const metadata={source:'dabbir_adaptive_appointment',phone:rawPhone,phone_e164:e164(rawPhone,business.phone_country_prefix)};
  const requestedCustomerId=clean(d.customer_id,60);let customer=null;
  if(requestedCustomerId&&!UUID.test(requestedCustomerId))return fail(res,400,'CUSTOMER_ID_INVALID');
  const customerId=requestedCustomerId||customerRequestId(businessId,user.id,idempotencyKey);
  const duration=Math.max(5,Math.min(1440,Number(d.duration)||60));const notes=[d.service&&`service: ${clean(d.service)}`,d.specialist&&`specialist: ${clean(d.specialist)}`,d.vehicle&&`vehicle: ${clean(d.vehicle)}`,d.location&&`location: ${clean(d.location)}`,d.notes&&`notes: ${clean(d.notes,1000)}`].filter(Boolean).join('\n');
  const row={business_id:businessId,branch_id:branchId,customer_id:customerId,starts_at:start.toISOString(),status:['requested','confirmed','cancelled'].includes(d.status)?d.status:'requested',simulated:false,notes:notes||null,ends_at:new Date(start.getTime()+duration*60000).toISOString()};if(d.price!==''&&Number.isFinite(Number(d.price)))row.quoted_price_aed=Math.max(0,Number(d.price));
  const fingerprint=createHash('sha256').update(JSON.stringify({actor_id:user.id,customer_name:name,customer_metadata:metadata,...row})).digest('hex').slice(0,32);
  const replay=async()=>{
   const rows=await rest(token,`dabbir_appointments?select=${APPOINTMENT_FIELDS}&business_id=eq.${encodeURIComponent(businessId)}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&limit=1`,{},'APPOINTMENT_REPLAY_LOOKUP_FAILED');
   const existing=rows[0];if(!existing)return null;
   if(existing.business_id!==businessId||existing.branch_id!==branchId||existing.customer_id!==customerId||existing.idempotency_key!==idempotencyKey||existing.idempotency_fingerprint!==fingerprint)throw failure('IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_BOOKING',409);
   if(!existing.id)throw failure('APPOINTMENT_CREATE_UNVERIFIED');
   return existing;
  };
  const previous=await replay();
  if(previous)return json(res,200,appointmentResult(previous,business,branchId,requestedCustomerId,true));
  if(requestedCustomerId){
   const existing=await rest(token,`dabbir_customers?select=id,display_name,metadata&business_id=eq.${encodeURIComponent(businessId)}&id=eq.${encodeURIComponent(requestedCustomerId)}&limit=1`,{},'CUSTOMER_LOOKUP_FAILED');
   customer=existing?.[0]||null;if(!customer)return fail(res,404,'CUSTOMER_NOT_FOUND');
  }else{
   metadata.adaptive_request_key=idempotencyKey;metadata.adaptive_request_fingerprint=fingerprint;
   const readCustomer=async()=>{
    const rows=await rest(token,`dabbir_customers?select=id,business_id,display_name,metadata&business_id=eq.${encodeURIComponent(businessId)}&id=eq.${encodeURIComponent(customerId)}&limit=1`,{},'CUSTOMER_LOOKUP_FAILED');
    return rows[0]||null;
   };
   customer=await readCustomer();
   if(!customer){
    try{
     const rows=await rest(token,'dabbir_customers?select=id,business_id,display_name,metadata',{method:'POST',headers:{prefer:'return=representation'},body:JSON.stringify({id:customerId,business_id:businessId,display_name:name,lead_status:'new',metadata})},'CUSTOMER_CREATE_FAILED','CUSTOMER_CREATE_UNVERIFIED');
     customer=rows[0]||null;
    }catch(error){if(!error.uniqueConflict)throw error;customer=await readCustomer();}
   }
   if(!customer)return fail(res,502,'CUSTOMER_CREATE_UNVERIFIED');
   if(customer.id!==customerId||customer.business_id!==businessId||customer.metadata?.source!=='dabbir_adaptive_appointment'||customer.metadata?.adaptive_request_key!==idempotencyKey||customer.metadata?.adaptive_request_fingerprint!==fingerprint)return fail(res,409,'CUSTOMER_IDEMPOTENCY_CONFLICT');
  }
  row.idempotency_key=idempotencyKey;row.idempotency_fingerprint=fingerprint;
  let appointment;
  try{
   const appointments=await rest(token,`dabbir_appointments?select=${APPOINTMENT_FIELDS}`,{method:'POST',headers:{prefer:'return=representation'},body:JSON.stringify(row)},'APPOINTMENT_CREATE_FAILED','APPOINTMENT_CREATE_UNVERIFIED');appointment=appointments[0];
  }catch(error){
   if(!error.uniqueConflict)throw error;
   const previous=await replay();if(!previous)throw failure('APPOINTMENT_CREATE_UNVERIFIED');
   return json(res,200,appointmentResult(previous,business,branchId,requestedCustomerId,true));
  }
  if(!appointment?.id)return fail(res,502,'APPOINTMENT_CREATE_UNVERIFIED');
  if(appointment.business_id!==businessId||appointment.branch_id!==branchId)return fail(res,502,'APPOINTMENT_BRANCH_UNVERIFIED');
  if(appointment.customer_id!==customerId||appointment.idempotency_key!==idempotencyKey||appointment.idempotency_fingerprint!==fingerprint)return fail(res,502,'APPOINTMENT_CREATE_UNVERIFIED');
  return json(res,200,appointmentResult(appointment,business,branchId,requestedCustomerId,false));
 }catch(e){return fail(res,e.status||e.code||500,e.message)}
}
