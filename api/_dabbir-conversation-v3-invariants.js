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

export function assertDialoguePlanV3({plan,state,response}){
  const facts=verifiedFacts(state),question=plan?.next_question||null;
  const asked=arr(question?.fields).map(x=>clean(x,80)).filter(Boolean);
  const confirmedAsked=asked.filter(field=>facts.has(field));
  if(confirmedAsked.length){
    throw Object.assign(new Error('V3_ASKED_CONFIRMED_FACT'),{code:'V3_ASKED_CONFIRMED_FACT',fields:confirmedAsked});
  }
  if(state?.intent_confirmed===true&&asked.includes('intent_confirmation')){
    throw Object.assign(new Error('V3_REDUNDANT_INTENT_CONFIRMATION'),{code:'V3_REDUNDANT_INTENT_CONFIRMATION'});
  }
  const tentativeFields=new Set(arr(state?.tentatives).map(x=>clean(x?.field,80)).filter(Boolean));
  const surfaced=new Set(arr(plan?.surfaced_tentative_fields).map(x=>clean(x,80)).filter(Boolean));
  const deferred=new Set(arr(plan?.deferred_tentative_fields).map(x=>clean(x,80)).filter(Boolean));
  if(deferred.size&&(plan?.turn_disposition!=='SOCIAL_ONLY'||plan?.proposed_action!=='REPLY'||question||arr(plan?.answers).length||arr(plan?.surfaced_facts).length||[...deferred].some(field=>!tentativeFields.has(field)))){
    throw Object.assign(new Error('V3_INVALID_TENTATIVE_DEFERRAL'),{code:'V3_INVALID_TENTATIVE_DEFERRAL'});
  }
  const dropped=[...tentativeFields].filter(field=>!surfaced.has(field)&&!asked.includes(field)&&!deferred.has(field));
  if(dropped.length){
    throw Object.assign(new Error('V3_TENTATIVE_FACT_DROPPED'),{code:'V3_TENTATIVE_FACT_DROPPED',fields:dropped});
  }
  if(response){
    assertFinalResponseSourceV3(response);
    const marks=(String(response.text).match(/[?؟]/g)||[]).length;
    if(marks>1)throw Object.assign(new Error('V3_MULTIPLE_USER_QUESTIONS'),{code:'V3_MULTIPLE_USER_QUESTIONS',count:marks});
  }
  return plan;
}

export function safeV3ShadowError(error){
  return {code:clean(error?.code||error?.message||'V3_SHADOW_ERROR',120),lost:arr(error?.lost).slice(0,12).map(x=>({field:clean(x?.field,80)})),fields:arr(error?.fields).slice(0,12).map(x=>clean(x,80))};
}
