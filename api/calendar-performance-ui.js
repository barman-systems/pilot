import calendarLiveHandler from './calendar-live-ui.js';

const PATCHES=[
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
  try{body=applyPerformancePatches(captured.body)}catch(error){
    console.error('dabbir_calendar_performance_patch_failed',String(error?.message||error));
    return res.status(500).end('Calendar performance guard unavailable');
  }
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=60');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-calendar-performance-ui','v1-event-scoped');
  return res.status(200).send(body);
}

export {applyPerformancePatches};
