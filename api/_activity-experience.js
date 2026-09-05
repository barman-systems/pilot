// Shared customer-facing information architecture. No API authorization is replaced here.
export function createActivityExperience(){
  const profiles={
    store:{name:['المتجر','Store'],activity:'operations',label:['الطلبات والمخزون','Orders & stock'],work:['الطلبات وتنبيهات المخزون','Orders & stock alerts'],types:['order','inventory'],services:false},
    salon:{name:['الصالون','Salon'],activity:'appointments',label:['الحجوزات','Bookings'],work:['حجوزات اليوم','Today’s bookings'],types:['appointment'],services:true},
    clinic:{name:['العيادة','Clinic'],activity:'appointments',label:['المواعيد','Appointments'],work:['مواعيد اليوم','Today’s appointments'],types:['appointment'],services:true},
    car_wash:{name:['غسيل السيارات','Car wash'],activity:'appointments',label:['الحجوزات','Bookings'],work:['حجوزات الغسيل اليوم','Today’s wash bookings'],types:['appointment'],services:true},
    laundry:{name:['المغسلة','Laundry'],activity:'appointments',label:['الاستلام والتسليم','Pickup & drop-off'],work:['حجوزات الاستلام والتسليم','Pickup & drop-off bookings'],types:['appointment'],services:true},
    services:{name:['الخدمات','Services'],activity:'appointments',label:['مواعيد الخدمات','Service bookings'],work:['مواعيد الخدمات اليوم','Today’s service bookings'],types:['appointment'],services:true},
    real_estate:{name:['العقارات','Real estate'],activity:'appointments',label:['المعاينات','Viewings'],work:['المعاينات القادمة','Upcoming viewings'],types:['appointment','followup'],services:false},
    creator:{name:['التعاونات','Collaborations'],activity:'appointments',label:['الجدول','Schedule'],work:['مواعيد التعاون القادمة','Upcoming collaboration appointments'],types:['appointment','followup'],services:false},
    other:{name:['النشاط','Business'],activity:'appointments',label:['المواعيد','Appointments'],work:['العمل القادم','Upcoming work'],types:['appointment','followup'],services:false},
  };
  const labels={dashboard:['اليوم','Today'],conversations:['المحادثات','Conversations'],customers:['العملاء','Customers'],more:['المزيد','More'],tasks:['المهام والقرارات','Tasks & decisions'],analytics:['التقارير','Reports'],settings:['الإعدادات','Settings'],integrations:['التكاملات والقنوات','Integrations & channels'],automations:['المتابعات المجدولة','Scheduled follow-ups'],notifications:['التنبيهات','Notifications'],help:['المساعدة','Help']};
  const defaults={owner:['*'],admin:['*'],manager:['view_business','view_conversations','view_customers','view_appointments','view_services','view_analytics','view_integrations','manage_handoffs','manage_automations'],employee:['view_business','view_conversations','view_customers','view_appointments','view_services','view_integrations','manage_handoffs'],staff:['view_business','view_conversations','view_customers','view_appointments','view_services','view_integrations','manage_handoffs'],agent:['view_business','view_conversations','view_customers','view_appointments','view_services','view_integrations','manage_handoffs'],viewer:['view_business','view_conversations','view_appointments','view_services','view_analytics']};
  const permission={conversations:'view_conversations',customers:'view_customers',appointments:'view_appointments',operations:'view_services',tasks:'manage_handoffs',analytics:'view_analytics',integrations:'view_integrations',automations:'manage_automations'};
  function model(workspace,language='ar'){
    const business=workspace?.business||{},membership=workspace?.membership||{},role=String(membership.role||'').toLowerCase(),type=String(business.business_type||'other').toLowerCase();
    const profile=profiles[type]||profiles.other,index=language==='en'?1:0;
    const capabilities=workspace?.activity_navigation_capabilities?.business_id===business.id?workspace.activity_navigation_capabilities:null;
    const grants=Array.isArray(membership.permissions)&&membership.permissions.length?membership.permissions:(defaults[role]||[]);
    const can=key=>grants.includes('*')||grants.includes(key);
    const allowed=screen=>{
      if(!business.id||!defaults[role])return false;
      if(['dashboard','more','help','settings','notifications'].includes(screen))return true;
      if(screen==='operations'&&type==='store')return ['owner','admin','manager','employee','staff'].includes(role)||can('manage_store_operations');
      if(screen==='operations'&&(!profile.services||capabilities?.show_services===false))return false;
      if(screen==='appointments'&&(type==='store'||capabilities?.show_appointments===false))return false;
      return !!permission[screen]&&can(permission[screen]);
    };
    const customerLabels={clinic:['المرضى','Patients'],real_estate:['العملاء المحتملون','Leads'],creator:['جهات التعاون','Collaboration leads']};
    const label=screen=>screen===profile.activity?profile.label[index]:screen==='customers'&&customerLabels[type]?customerLabels[type][index]:(labels[screen]?.[index]||screen);
    return {type,role,profile,allowed,can,label,name:profile.name[index],work:profile.work[index],owner:role==='owner',primary:['dashboard',profile.activity,'conversations','customers','more'].filter(allowed),secondary:['tasks','analytics','notifications'].filter(allowed),settings:['integrations','automations','help'].filter(allowed)};
  }
  function dayKey(value,zone){try{return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))}catch{return null}}
  function workRows(workspace,language='ar',now=Date.now()){
    const m=model(workspace,language),zone=workspace?.business?.timezone||'Asia/Dubai';
    if(m.type==='store')return (workspace?.owner_action_center?.items||[]).filter(x=>m.profile.types.includes(x.type)&&m.allowed(x.target)).map(x=>({id:x.entity_id,type:x.type,target:x.target,title:language==='en'?x.title_en:x.title_ar,detail:language==='en'?x.detail_en:x.detail_ar}));
    if(!m.allowed('appointments'))return [];
    const today=dayKey(now,zone);if(!today)return [];const future=['real_estate','creator','other'].includes(m.type);
    return (workspace?.appointments||[]).filter(x=>!['cancelled','canceled','completed','no_show'].includes(String(x.status).toLowerCase())&&x.simulated!==true&&(future?new Date(x.starts_at).getTime()>=now:dayKey(x.starts_at,zone)===today)).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)).map(x=>({id:x.id,type:'appointment',target:'appointments',title:(workspace.customers||[]).find(c=>c.id===x.customer_id)?.display_name||(language==='en'?'Customer':'عميل'),detail:x.starts_at,customer_id:x.customer_id}));
  }
  return {profiles,model,workRows};
}
