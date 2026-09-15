import {findOptionsResult} from './_dabbir-v3-tool-reasoning.js';
const arr=v=>Array.isArray(v)?v:[];
const clean=(v,n=200)=>String(v??'').trim().replace(/\s+/g,' ').slice(0,n);
const verified=(state,field)=>arr(state?.facts).find(f=>f?.field===field&&f?.status==='VERIFIED')?.value??null;

function isoDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v):null;}
function exactTime(v){return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v||''))?String(v):null;}
function constraint(req,kind){return arr(req?.hard_constraints).find(x=>x?.kind===kind)||null;}

export function availabilityProbePlan({request,state}={}){
  const service=verified(state,'service'),worker=verified(state,'worker'),date=isoDate(verified(state,'date')||constraint(request,'date')?.value),time=exactTime(verified(state,'time')||constraint(request,'exact_time')?.value);
  const notBefore=exactTime(constraint(request,'not_before')?.value),notAfter=exactTime(constraint(request,'not_after')?.value);
  if(!service)return {ok:false,state:'NEED_GROUNDED_SERVICE'};
  if(!date)return {ok:false,state:'NEED_GROUNDED_DATE'};
  if(time)return {ok:true,mode:'EXACT',service_id:service,worker_id:worker||null,requested_local:`${date}T${time}:00`,read_only:true};
  return {ok:true,mode:'BROAD',service_id:service,worker_id:worker||null,requested_date:date,from:notBefore,to:notAfter,max_candidates:12,read_only:true};
}

export async function findOptionsWithExistingAvailability({request,state,context,readAvailability,readBroadAvailability}={}){
  const plan=availabilityProbePlan({request,state});if(!plan.ok)return {...plan,candidates:[],grounded:true};
  let raw;
  if(plan.mode==='EXACT'){
    if(typeof readAvailability!=='function')return {ok:false,state:'READ_TOOL_UNAVAILABLE',candidates:[],grounded:true};
    raw=await readAvailability({business_id:context?.business?.id,conversation_id:context?.conversation?.id,service_id:plan.service_id,worker_id:plan.worker_id,requested_local:plan.requested_local});
  }else{
    if(typeof readBroadAvailability!=='function')return {ok:false,state:'BROAD_READ_TOOL_UNAVAILABLE',candidates:[],grounded:true};
    raw=await readBroadAvailability({business_id:context?.business?.id,conversation_id:context?.conversation?.id,service_id:plan.service_id,worker_id:plan.worker_id,requested_date:plan.requested_date,from:plan.from,to:plan.to,max_candidates:plan.max_candidates});
  }
  const result=findOptionsResult(raw||{});
  return {ok:true,state:result.candidates.length?'OPTIONS_FOUND':'NO_OPTIONS',...result,query:plan,reason:clean(raw?.state,80)||null};
}
