import {normalizeSemanticText} from './_dabbir-semantic-engine-core.js';
import {verifiedOperationalFact} from './_dabbir-activity-intelligence.js';

// Read-only response facet over the current branch catalog. The interpreter
// names the requested attribute; it never supplies its value or a booking fact.
export function answerServiceQuestion({context:c,state,decision,proposal}){
 const q=proposal?.serviceQuestion,raw=(c.batch_messages||[]).map(m=>m.language_body??m.body??'').join(' ');
 if(!q||!['price','duration_minutes'].includes(q.field)||typeof q.evidence!=='string'||!q.evidence.trim()||!raw.includes(q.evidence)||Number(proposal.confidence)<.8||!['REPLY','PRICING','SERVICE_MENU'].includes(decision.action))return decision;
 const ar=state.language==='ar',catalog=(c.services||[]).filter(s=>(!s.business_id||s.business_id===c.business.id)&&(!s.branch_id||s.branch_id===c.conversation.branch_id));
 const named=proposal.serviceName?catalog.filter(s=>[s.name_ar,s.name,s.name_en].some(n=>n&&normalizeSemanticText(n)===normalizeSemanticText(proposal.serviceName))):[];
 const selected=verifiedOperationalFact(state.entities?.service)?state.entities.service.value:null;
 const target=decision.queryServiceVerified===true?decision.queryServiceId:selected;
 const service=proposal.serviceName?(named.length===1?named[0]:null):q.explicit_service?null:catalog.find(s=>s.id===target);
 const label=String(service?.name_ar||service?.name||service?.name_en||'').slice(0,180);
 const value=service?.[q.field],numeric=value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
 const currency=String(c.business.currency_code||'');
 const verified=q.field==='price'?numeric&&Number(value)>=0&&/^[A-Z]{3}$/.test(currency):numeric&&Number(value)>0;
 let reply;
 if(!service){
  state.service_inquiry={field:q.field,pending_field:'service'};state.pending_action='CLARIFY';state.clarification_entity='service_question_target';
  return {...decision,action:'CLARIFY',reasonCode:'SERVICE_QUESTION_TARGET_UNRESOLVED',missingFields:['service'],reply:ar?'أي خدمة تقصد؟':'Which service do you mean?',resumeReply:null};
 }
 else if(!verified)reply=ar?`${q.field==='price'?'سعر':'مدة'} ${label} غير محدد في بيانات النشاط.`:`The ${q.field==='price'?'price':'duration'} for ${label} is not specified in the business information.`;
 else if(q.field==='price')reply=ar?`${label} بـ${Number(value)} ${currency}.`:`${label} costs ${Number(value)} ${currency}.`;
 else reply=ar?`${label} مدته ${Number(value)} دقيقة.`:`${label} takes ${Number(value)} minutes.`;
 if(decision.resumeReply)reply+='\n'+decision.resumeReply;
 delete state.service_inquiry;
 return {...decision,action:'REPLY',reasonCode:service?(verified?'VERIFIED_SERVICE_ATTRIBUTE':'SERVICE_ATTRIBUTE_UNAVAILABLE'):'SERVICE_QUESTION_TARGET_UNRESOLVED',reply,
  serviceQuestion:{field:q.field,verified:!!(service&&verified),service_id:service?.id||null}};
}
