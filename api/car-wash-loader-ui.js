const script=String.raw`(()=>{
  if(window.__dabbirCarWashLoader)return;
  const workspaceNow=()=>{try{return typeof workspace!=='undefined'?workspace:window.workspace}catch{return window.workspace||null}};
  const isCarWash=()=>String(workspaceNow()?.business?.business_type||'').toLowerCase()==='car_wash';
  let loading=false,loaded=false,attempts=0;

  function enforceSingleCalendar(){
    const duplicate=document.querySelector('#dabbirGenericCalendar');
    if(!duplicate)return false;
    if(isCarWash()){
      duplicate.setAttribute('hidden','');
      duplicate.style.setProperty('display','none','important');
      duplicate.dataset.dabbirCarWashDuplicate='hidden';
      return true;
    }
    if(duplicate.dataset.dabbirCarWashDuplicate==='hidden'){
      duplicate.style.removeProperty('display');
      duplicate.removeAttribute('hidden');
      delete duplicate.dataset.dabbirCarWashDuplicate;
    }
    return false;
  }

  function load(){
    enforceSingleCalendar();
    if(loaded||loading||!isCarWash())return false;
    if(window.__dabbirCarWashBookingUi){loaded=true;return true}
    const existing=document.querySelector('script[data-dabbir-car-wash-ui="1"]');
    if(existing){loading=true;return true}
    loading=true;
    const node=document.createElement('script');
    node.src='/api/car-wash-booking-ui?v=20260831-ops-v1';
    node.async=true;
    node.dataset.dabbirCarWashUi='1';
    node.onload=()=>{loaded=true;loading=false;enforceSingleCalendar()};
    node.onerror=()=>{loading=false;console.error('dabbir_car_wash_ui_load_failed')};
    document.head.appendChild(node);
    return true;
  }

  const timer=setInterval(()=>{attempts+=1;enforceSingleCalendar();if(load()||attempts>=40)clearInterval(timer)},500);
  const loaderObserver=new MutationObserver(()=>{if(load())loaderObserver.disconnect()});
  loaderObserver.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  const calendarObserver=new MutationObserver(enforceSingleCalendar);
  calendarObserver.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden']});
  setTimeout(()=>{load();enforceSingleCalendar();if(attempts>=40)loaderObserver.disconnect()},20000);
  window.addEventListener('focus',()=>{load();enforceSingleCalendar()},{passive:true});
  window.__dabbirCarWashLoader={load,enforceSingleCalendar,get loaded(){return loaded}};
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=300');
  res.setHeader('x-dabbir-car-wash-loader-ui','v2-single-calendar');
  return res.status(200).send(script);
}
