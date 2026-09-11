const arr=v=>Array.isArray(v)?v:[];
const clean=(v,n=500)=>String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').slice(0,n);

export const V3_RESPONSE_SOURCE='CONVERSATION_BRAIN_V3';
export const V3_FACT_STATUSES=Object.freeze(['VERIFIED','TENTATIVE','CONFLICT','UNRESOLVED_REFERENCE','INVALID_FORMAT']);

const factKey=f=>clean(f?.field,80);
const verifiedFacts=snapshot=>new Map(arr(snapshot?.facts).filter(f=>f?.status==='VERIFIED'&&factKey(f)).map(f=>[factKey(f),f]));
const invalidationMap=snapshot=>new Map(arr(snapshot?.invalidations).filter(x=>clean(x?.field,80)&&clean(x?.reason,160)).map(x=>[clean(x.field,80),clean(x.reason,160)]));

export function assertFactRetentionV3({before,after}){
  const prior=verifiedFacts(before),next=verifiedFacts(after),invalidated=invalidationMap(after);
  const lost=[];
  for(const [field,fact] of prior){
    const current=next.get(field);
    if(current&&JSON.stringify(current.value)===JSON.stringify(fact.value))continue;
    const reason=invalidated.get(field);
    if(!reason)lost.push({field,before_value:fact.value,after_value:current?.value??null});
  }
  if(lost.length){
    const error=Object.assign(new Error('V3_FACT_RETENTION_VIOLATION'),{code:'V3_FACT_RETENTION_VIOLATION',lost});
    throw error;
  }
  return after;
}

export function assertFinalResponseSourceV3(response){
  if(!response||response.source!==V3_RESPONSE_SOURCE||typeof response.text!=='string'||!response.text.trim()){
    throw Object.assign(new Error('V3_NON_BRAIN_RESPONSE_SOURCE'),{code:'V3_NON_BRAIN_RESPONSE_SOURCE',source:clean(response?.source,120)||null});
  }
  return response;
}

export function brainResponseV3({text,plan_id=null,metadata=null}){
  return assertFinalResponseSourceV3({source:V3_RESPONSE_SOURCE,text:clean(text,1600),plan_id,metadata});
}

export function safeV3ShadowError(error){
  return {code:clean(error?.code||error?.message||'V3_SHADOW_ERROR',120),lost:arr(error?.lost).slice(0,12).map(x=>({field:clean(x?.field,80)}))};
}
