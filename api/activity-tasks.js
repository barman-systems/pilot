import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  readJsonBody,
  requireSameOrigin,
  supabaseRest,
  supabaseRpc,
} from './_auth-core.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId=value=>UUID_RE.test(String(value||'').trim())?String(value).trim():null;

async function readData(response,fallback){
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=null}
  if(!response.ok){const error=new Error(fallback);error.status=response.status;error.detail=payload?.message||payload?.code||null;throw error}
  return payload;
}
const rest=(token,path,fallback)=>supabaseRest(path,token).then(r=>readData(r,fallback));
const rpc=(token,name,params,fallback)=>supabaseRpc(name,token,params).then(r=>readData(r,fallback));

const profiles={
  clinic:{name_ar:'عيادة',name_en:'Clinic',customer_ar:'المرضى',customer_en:'Patients',appointments_ar:'المواعيد',appointments_en:'Appointments',tasks_ar:'مهام العيادة',tasks_en:'Clinic tasks',dashboard_ar:'تشغيل العيادة',dashboard_en:'Clinic operations',show_appointments:true,show_services:true,show_operations:false},
  store:{name_ar:'متجر',name_en:'Store',customer_ar:'العملاء',customer_en:'Customers',appointments_ar:'',appointments_en:'',tasks_ar:'مهام المتجر',tasks_en:'Store tasks',dashboard_ar:'تشغيل المتجر',dashboard_en:'Store operations',show_appointments:false,show_services:false,show_operations:true},
  salon:{name_ar:'صالون',name_en:'Salon',customer_ar:'العملاء',customer_en:'Clients',appointments_ar:'الحجوزات',appointments_en:'Bookings',tasks_ar:'مهام الصالون',tasks_en:'Salon tasks',dashboard_ar:'تشغيل الصالون',dashboard_en:'Salon operations',show_appointments:true,show_services:true,show_operations:false},
  real_estate:{name_ar:'عقارات',name_en:'Real estate',customer_ar:'العملاء المحتملون',customer_en:'Leads',appointments_ar:'المعاينات',appointments_en:'Viewings',tasks_ar:'مهام العقارات',tasks_en:'Real-estate tasks',dashboard_ar:'تشغيل العقارات',dashboard_en:'Real-estate operations',show_appointments:true,show_services:false,show_operations:false},
  creator:{name_ar:'مشهور / صانع محتوى',name_en:'Creator / Influencer',customer_ar:'جهات التعاون',customer_en:'Collaboration leads',appointments_ar:'الجدول',appointments_en:'Schedule',tasks_ar:'مهام التعاون',tasks_en:'Collaboration tasks',dashboard_ar:'إدارة التعاون والجدول',dashboard_en:'Collaboration & schedule',show_appointments:true,show_services:false,show_operations:false},
  services:{name_ar:'خدمات',name_en:'Services',customer_ar:'العملاء',customer_en:'Customers',appointments_ar:'الحجوزات / الطلبات',appointments_en:'Bookings / requests',tasks_ar:'مهام الخدمات',tasks_en:'Service tasks',dashboard_ar:'تشغيل الخدمات',dashboard_en:'Service operations',show_appointments:true,show_services:true,show_operations:false},
  other:{name_ar:'نشاط',name_en:'Business',customer_ar:'العملاء',customer_en:'Customers',appointments_ar:'المواعيد',appointments_en:'Appointments',tasks_ar:'مهام النشاط',tasks_en:'Business tasks',dashboard_ar:'تشغيل النشاط',dashboard_en:'Business operations',show_appointments:true,show_services:true,show_operations:false},
};

async function context(req,res){
  const token=accessTokenFromRequest(req);
  if(!token){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  const [user,memberships]=await Promise.all([getVerifiedUser(token).catch(()=>null),getBusinessMemberships(token).catch(()=>[])]);
  if(!user){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  return {token,user,memberships};
}
function membershipFor(memberships,businessId){return memberships.find(m=>m.business_id===businessId)||null}

export default async function handler(req,res){
  const ctx=await context(req,res);if(!ctx)return;
  try{
    if(req.method==='GET'){
      const businessId=safeId(req.query?.business_id);
      const membership=membershipFor(ctx.memberships,businessId);
      if(!businessId||!membership)return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});
      const businesses=await rest(ctx.token,`dabbir_businesses?select=id,name,business_type&business_id=eq.${businessId}`,'BUSINESS_LOOKUP_FAILED').catch(()=>null);
      let business=Array.isArray(businesses)?businesses[0]:null;
      if(!business){
        const rows=await rest(ctx.token,`dabbir_businesses?select=id,name,business_type&id=eq.${businessId}&limit=1`,'BUSINESS_LOOKUP_FAILED');
        business=rows?.[0]||null;
      }
      if(!business)return json(res,404,{ok:false,error:'BUSINESS_NOT_FOUND'});
      const type=String(business.business_type||'other').toLowerCase();
      const tasks=await rest(ctx.token,`dabbir_tasks?select=id,task_key,category,title_ar,title_en,priority,status,due_at,source,metadata,created_at,updated_at&business_id=eq.${businessId}&order=priority.desc,created_at.asc&limit=100`,'TASKS_LOOKUP_FAILED');
      return json(res,200,{ok:true,business_id:businessId,business_type:type,profile:profiles[type]||profiles.other,tasks:tasks||[],can_manage:['owner','admin'].includes(String(membership.role||'').toLowerCase())});
    }
    if(req.method==='POST'){
      if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
      const body=await readJsonBody(req);
      const businessId=safeId(body.business_id),taskId=safeId(body.task_id),status=String(body.status||'').toLowerCase();
      const membership=membershipFor(ctx.memberships,businessId);
      if(!businessId||!taskId||!membership)return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});
      if(!['owner','admin'].includes(String(membership.role||'').toLowerCase()))return json(res,403,{ok:false,error:'BUSINESS_MANAGEMENT_REQUIRED'});
      if(!['pending','in_progress','done','dismissed'].includes(status))return json(res,400,{ok:false,error:'INVALID_TASK_STATUS'});
      const result=await rpc(ctx.token,'dabbir_set_task_status',{p_business_id:businessId,p_task_id:taskId,p_status:status},'TASK_UPDATE_FAILED');
      return json(res,200,{ok:true,result});
    }
    return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
  }catch(error){
    const status=Number(error?.status||500);const safe=[400,401,403,404,409,429,502,503].includes(status)?status:500;
    console.error('dabbir_activity_tasks_failed',{error:String(error?.message||'ACTIVITY_TASKS_FAILED').slice(0,140),status:safe});
    return json(res,safe,{ok:false,error:String(error?.message||'ACTIVITY_TASKS_FAILED').slice(0,140),detail:error?.detail||undefined});
  }
}
