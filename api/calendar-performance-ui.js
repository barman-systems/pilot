import calendarLiveHandler from './calendar-live-ui.js';
import {applySalonProductModelPatches} from './salon-product-model-ui-patches.js';

const PATCHES=[
  {
    name:'activity-profile-business-timezone-day-key',
    from:`  function dayKey(value){const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return '';return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}\n  function startOfWeek(value){const d=new Date(value);d.setHours(0,0,0,0);const dow=(d.getDay()+6)%7;d.setDate(d.getDate()-dow);return d}`,
    to:`  function businessTimezone(){const b=workspace?.business||{};if(b.timezone)return String(b.timezone);const loc=String(b.locale||'ar-AE').toUpperCase();if(loc.endsWith('-SA'))return 'Asia/Riyadh';if(loc.endsWith('-KW'))return 'Asia/Kuwait';if(loc.endsWith('-QA'))return 'Asia/Qatar';if(loc.endsWith('-BH'))return 'Asia/Bahrain';if(loc.endsWith('-OM'))return 'Asia/Muscat';return 'Asia/Dubai'}\n  function dayKey(value){const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return '';try{const f=new Intl.DateTimeFormat('en-CA',{timeZone:businessTimezone(),year:'numeric',month:'2-digit',day:'2-digit'}),p=Object.fromEntries(f.formatToParts(d).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day}catch{return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}}\n  function startOfWeek(value){const d=new Date(value);d.setHours(0,0,0,0);const dow=(d.getDay()+6)%7;d.setDate(d.getDate()-dow);return d}`,
  },
  {
    name:'activity-profile-business-timezone-clock',
    from:`  function fmtTime(value){try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{hour:'numeric',minute:'2-digit'}).format(new Date(value))}catch{return ''}}`,
    to:`  function fmtTime(value){try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{timeZone:businessTimezone(),hour:'numeric',minute:'2-digit'}).format(new Date(value))}catch{return ''}}`,
  },
  {
    name:'activity-profile-hide-cancelled-bookings',
    from:`  function appointments(){return (workspace?.appointments||[]).filter(a=>a?.starts_at&&!Number.isNaN(new Date(a.starts_at).getTime())).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at))}`,
    to:`  function appointments(){return (workspace?.appointments||[]).filter(a=>a?.starts_at&&!['cancelled','canceled'].includes(String(a.status||'').toLowerCase())&&!Number.isNaN(new Date(a.starts_at).getTime())).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at))}`,
  },
  {
    name:'activity-profile-today-metric',
    from:`    if(cards[1]?.querySelector('span'))cards[1].querySelector('span').textContent=p.show_appointments?appointmentLabel:(ar()?'المتابعات':'Follow-ups');\n    if(cards[2]?.querySelector('span'))cards[2].querySelector('span').textContent=customerLabel;`,
    to:`    if(cards[1]?.querySelector('span'))cards[1].querySelector('span').textContent=p.show_appointments?appointmentLabel:(ar()?'المتابعات':'Follow-ups');\n    if(p.show_appointments){const todayCount=appointments().filter(a=>dayKey(a.starts_at)===dayKey(new Date())).length,todayStrong=cards[1]?.querySelector('strong'),nextToday=String(todayCount);if(todayStrong&&todayStrong.textContent!==nextToday)todayStrong.textContent=nextToday}\n    if(cards[2]?.querySelector('span'))cards[2].querySelector('span').textContent=customerLabel;`,
  },
  {
    name:'appointment-management-business-timezone',
    from:`  function fmt(value){\n    try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Dubai'}).format(new Date(value))}catch{return String(value||'')}\n  }\n  function statusLabel(status){\n    const c=copy(),s=String(status||'requested').toLowerCase();\n    return c[s]||s;\n  }\n  function dubaiLocalMinute(date=new Date()){\n    const f=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});\n    const p=Object.fromEntries(f.formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));\n    return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute;\n  }\n  function isoFromDubaiLocal(value){\n    const raw=String(value||'').trim();\n    if(!/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/.test(raw))return null;\n    const d=new Date(raw+':00+04:00');\n    return Number.isNaN(d.getTime())?null:d.toISOString();\n  }`,
    to:`  function businessTimezone(){const b=ws()?.business||{};if(b.timezone)return String(b.timezone);const loc=String(b.locale||'ar-AE').toUpperCase();if(loc.endsWith('-SA'))return 'Asia/Riyadh';if(loc.endsWith('-KW'))return 'Asia/Kuwait';if(loc.endsWith('-QA'))return 'Asia/Qatar';if(loc.endsWith('-BH'))return 'Asia/Bahrain';if(loc.endsWith('-OM'))return 'Asia/Muscat';return 'Asia/Dubai'}\n  function timezoneParts(date){const f=new Intl.DateTimeFormat('en-CA',{timeZone:businessTimezone(),year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});return Object.fromEntries(f.formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]))}\n  function timezoneOffsetMinutes(date){const p=timezoneParts(date),asUtc=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);return Math.round((asUtc-date.getTime())/60000)}\n  function fmt(value){\n    try{return new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{dateStyle:'medium',timeStyle:'short',timeZone:businessTimezone()}).format(new Date(value))}catch{return String(value||'')}\n  }\n  function statusLabel(status){\n    const c=copy(),s=String(status||'requested').toLowerCase();\n    return c[s]||s;\n  }\n  function dubaiLocalMinute(date=new Date()){\n    const p=timezoneParts(date);\n    return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute;\n  }\n  function isoFromDubaiLocal(value){\n    const raw=String(value||'').trim();\n    if(!/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/.test(raw))return null;\n    const [datePart,timePart]=raw.split('T'),[year,month,day]=datePart.split('-').map(Number),[hour,minute]=timePart.split(':').map(Number);\n    const wallUtc=Date.UTC(year,month-1,day,hour,minute,0),guess=new Date(wallUtc);\n    let offset=timezoneOffsetMinutes(guess),resolved=new Date(wallUtc-offset*60000),refined=timezoneOffsetMinutes(resolved);\n    if(refined!==offset)resolved=new Date(wallUtc-refined*60000);\n    return Number.isNaN(resolved.getTime())?null:resolved.toISOString();\n  }`,
  },
  {
    name:'activity-profile-navigation-observer',
    from:`  const observer=new MutationObserver(()=>{if(workspace?.business?.id){setTimeout(applyProfile,0);load(false)}});\n  observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});`,
    to:`  let profileApplyQueued=false;\n  function scheduleProfileApply(){\n    if(profileApplyQueued)return;\n    profileApplyQueued=true;\n    const run=()=>{profileApplyQueued=false;if(workspace?.business?.id)void load(false)};\n    if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,0);\n  }\n  const profileLanguageObserver=new MutationObserver(scheduleProfileApply);\n  profileLanguageObserver.observe(document.documentElement,{attributes:true,attributeFilter:['lang','dir']});\n  try{\n    const baseRenderAllProfile=renderAll;\n    renderAll=function(){const result=baseRenderAllProfile.apply(this,arguments);scheduleProfileApply();return result};\n  }catch{}`,
  },
  {
    name:'activity-profile-business-polling',
    from:`  setInterval(()=>{if(workspace?.business?.id&&workspace.business.id!==lastBusiness)load(true)},1200);`,
    to:`  // Business changes are driven by renderAll; do not poll the owner shell every 1.2 seconds.`,
  },
  {
    name:'calendar-live-navigation-observer',
    from:`  const observer=new MutationObserver(schedulePassiveSync);\n  observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});\n  const calendarScreen=q('#screen-appointments');`,
    to:`  const calendarScreen=q('#screen-appointments');\n  if(calendarScreen){\n    const activationObserver=new MutationObserver(schedulePassiveSync);\n    activationObserver.observe(calendarScreen,{attributes:true,attributeFilter:['class']});\n  }`,
  },
  {
    name:'appointment-management-global-observer-and-poll',
    from:`  const observer=new MutationObserver(()=>{if(q('#screen-appointments')?.classList.contains('active'))setTimeout(render,0)});\n  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});\n  setInterval(()=>{if(q('#screen-appointments')?.classList.contains('active'))render()},1500);`,
    to:`  const appointmentScreen=q('#screen-appointments');\n  if(appointmentScreen){\n    const screenObserver=new MutationObserver(()=>{if(appointmentScreen.classList.contains('active'))setTimeout(render,0)});\n    screenObserver.observe(appointmentScreen,{attributes:true,attributeFilter:['class']});\n  }\n  const appointmentTable=q('#appointmentsTable');\n  if(appointmentTable){\n    const tableObserver=new MutationObserver(()=>{if(q('#screen-appointments')?.classList.contains('active'))setTimeout(render,0)});\n    tableObserver.observe(appointmentTable,{childList:true});\n  }`,
  },
  {
    name:'clinic-loading-state',
    from:`  let D=null,busy=false;`,
    to:`  let D=null,busy=false,loading=false;`,
  },
  {
    name:'clinic-load-coalescing',
    from:`  async function load(){if(!isClinic()||!bid()||busy)return;try{D=await api();render()}catch(e){console.error('clinic_mode_load',e)}}`,
    to:`  async function load(){if(!isClinic()||!bid()||busy||loading)return;loading=true;try{D=await api();render()}catch(e){console.error('clinic_mode_load',e)}finally{loading=false}}`,
  },
  {
    name:'clinic-global-observer',
    from:`  const mo=new MutationObserver(()=>{if(isClinic()&&$('#screen-appointments')?.classList.contains('active'))load()});mo.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class'],childList:true});setTimeout(load,700);window.__dabbirClinicMode={refresh:load,version:'beauty-laser-v1-no-images'};`,
    to:`  const clinicScreen=$('#screen-appointments');\n  if(clinicScreen){\n    const clinicActivationObserver=new MutationObserver(()=>{if(isClinic()&&clinicScreen.classList.contains('active'))load()});\n    clinicActivationObserver.observe(clinicScreen,{attributes:true,attributeFilter:['class']});\n  }\n  try{\n    const baseRenderAllClinic=renderAll;\n    renderAll=function(){const result=baseRenderAllClinic.apply(this,arguments);if(isClinic()&&clinicScreen?.classList.contains('active'))setTimeout(load,0);return result};\n  }catch{}\n  setTimeout(load,700);window.__dabbirClinicMode={refresh:load,version:'beauty-laser-v2-event-scoped'};`,
  },
  {
    name:'business-activity-global-observer',
    from:`  const observer=new MutationObserver(()=>{if(genericCard()&&business()?.id)setTimeout(enforce,0)});\n  observer.observe(document.body,{subtree:true,childList:true});\n  try{const baseRenderAll=renderAll;renderAll=function(){const result=baseRenderAll.apply(this,arguments);setTimeout(enforce,0);return result}}catch{}\n  try{const baseApplyLang=applyLang;applyLang=function(){const result=baseApplyLang.apply(this,arguments);lastRenderKey='';setTimeout(enforce,0);return result}}catch{}`,
    to:`  let businessProfileQueued=false;\n  function scheduleBusinessProfileEnforce(){\n    if(businessProfileQueued)return;\n    businessProfileQueued=true;\n    const run=()=>{businessProfileQueued=false;if(genericCard()&&business()?.id)enforce()};\n    if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,0);\n  }\n  const settingsProfileScreen=q('#screen-settings');\n  if(settingsProfileScreen){\n    const observer=new MutationObserver(scheduleBusinessProfileEnforce);\n    observer.observe(settingsProfileScreen,{subtree:true,childList:true});\n  }\n  try{const baseRenderAll=renderAll;renderAll=function(){const result=baseRenderAll.apply(this,arguments);scheduleBusinessProfileEnforce();return result}}catch{}\n  try{const baseApplyLang=applyLang;applyLang=function(){const result=baseApplyLang.apply(this,arguments);lastRenderKey='';scheduleBusinessProfileEnforce();return result}}catch{}`,
  },
];

function captureResponse(){
  return {
    statusCode:200,
    headers:{},
    body:'',
    status(code){this.statusCode=Number(code||200);return this},
    setHeader(key,value){this.headers[String(key).toLowerCase()]=value;return this},
    send(body=''){this.body=String(body);return this},
    end(body=''){this.body=String(body);return this},
  };
}

function applyPerformancePatches(source){
  let body=String(source||'');
  for(const patch of PATCHES){
    if(!body.includes(patch.from))throw new Error('DABBIR_NAV_PERFORMANCE_PATTERN_DRIFT_'+patch.name);
    body=body.replace(patch.from,patch.to);
    if(body.includes(patch.from))throw new Error('DABBIR_NAV_PERFORMANCE_PATCH_INCOMPLETE_'+patch.name);
  }
  return body;
}

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  const captured=captureResponse();
  await calendarLiveHandler(req,captured);
  if(captured.statusCode!==200||!captured.body)return res.status(500).end('Calendar UI unavailable');
  let body;
  try{body=applySalonProductModelPatches(applyPerformancePatches(captured.body))}catch(error){
    console.error('dabbir_calendar_performance_patch_failed',String(error?.message||error));
    return res.status(500).end('Calendar performance guard unavailable');
  }
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=60');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-calendar-performance-ui','v4-salon-employee-first');
  return res.status(200).send(body);
}

export {applyPerformancePatches};
