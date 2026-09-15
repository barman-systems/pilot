const arr=v=>Array.isArray(v)?v:[];
const isoDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v):null;
const hhmm=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v||''))?String(v):null;
const fact=(state,field)=>arr(state?.facts).find(x=>x?.field===field&&x?.status==='VERIFIED')?.value??null;
const hard=(request,kind)=>arr(request?.hard_constraints).find(x=>x?.kind===kind)?.value??null;

export function buildAvailabilitySearchScope({request,state,maxCandidates=12}={}){
  const serviceId=fact(state,'service');
  const date=isoDate(fact(state,'date')||hard(request,'date'));
  const exact=hhmm(fact(state,'time')||hard(request,'exact_time'));
  const notBefore=hhmm(hard(request,'not_before'));
  const notAfter=hhmm(hard(request,'not_after'));
  if(!serviceId)return {ok:false,state:'NEED_GROUNDED_SERVICE'};
  if(!date)return {ok:false,state:'NEED_GROUNDED_DATE'};
  if(exact)return {ok:true,service_id:serviceId,date,mode:'EXACT',from:exact,to:exact,max_candidates:1,read_only:true};
  return {ok:true,service_id:serviceId,date,mode:'DAY',from:notBefore,to:notAfter,max_candidates:Math.max(1,Math.min(Number(maxCandidates)||12,12)),read_only:true};
}

export function filterGroundedAvailabilityRows(rows,scope){
  if(!scope?.ok)return [];
  return arr(rows).filter(row=>{
    const local=String(row?.local_start||'');
    if(!local.startsWith(`${scope.date}T`))return false;
    if(row?.service_id&&String(row.service_id)!==String(scope.service_id))return false;
    const t=local.slice(11,16);
    if(scope.mode==='EXACT'&&t!==scope.from)return false;
    if(scope.from&&t<scope.from)return false;
    if(scope.to&&t>scope.to)return false;
    return true;
  }).slice(0,scope.max_candidates);
}
