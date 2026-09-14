import {normalizeSemanticText} from './_dabbir-semantic-engine-core.js';
import {verifiedOperationalFact} from './_dabbir-activity-intelligence.js';
import {serviceAttributeReply} from './_dabbir-conversation-brain-response.js';

// Read-only response facet over the current branch catalog. The interpreter
// names the requested attribute; it never supplies its value or a booking fact.
// This module resolves only the verified target/fact; customer prose is Brain-owned.
export function answerServiceQuestion({context:c,state,decision,proposal}){
 const q=proposal?.serviceQuestion,raw=(c.batch_messages||[]).map(m=>m.language_body??m.body??'').join(' ');
 if(!q||!['price','duration_minutes'].includes(q.field)||typeof q.evidence!=='string'||!q.evidence.trim()||!raw.includes(q.evidence)||Number(proposal.confidence)<.8||!['REPLY','PRICING','SERVICE_MENU'].includes(decision.action))return decision;
 const catalog=(c.services||[]).filter(s=>(!s.business_id||s.business_id===c.business.id)&&(!s.branch_id||s.branch_id===c.conversation.branch_id));
 const named=proposal.serviceName?catalog.filter(s=>[s.name_ar,s.name,s.name_en].some(n=>n&&normalizeSemanticText(n)===normalizeSemanticText(proposal.serviceName))):[];
 const selected=verifiedOperationalFact(state.entities?.service)?state.entities.service.value:null;
 const target=decision.queryServiceVerified===true?decision.queryServiceId:selected;
 const service=proposal.serviceName?(named.length===1?named[0]:null):q.explicit_service?null:catalog.find(s=>s.id===target);
 const label=String(service?.name_ar||service?.name||service?.name_en||'').slice(0,180);
 const value=service?.[q.field],numeric=value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
 const currency=String(c.business.currency_code||'');
 const verified=q.field==='price'?numeric&&Number(value)>=0&&/^[A-Z]{3}$/.test(currency):numeric&&Number(value)>0;
 if(!service){
  state.service_inquiry={field:q.field,pending_field:'service'};state.pending_action='CLARIFY';state.clarification_entity='service_question_target';
  return {...decision,action:'CLARIFY',reasonCode:'SERVICE_QUESTION_TARGET_UNRESOLVED',missingFields:['service'],reply:serviceAttributeReply({status:'TARGET_UNRESOLVED',field:q.field,language:state.language}),resumeReply:null};
 }
 const reply=serviceAttributeReply({status:verified?'VERIFIED':'UNAVAILABLE',field:q.field,label,value,currency,language:state.language,resumeReply:decision.resumeReply});
 delete state.service_inquiry;
 return {...decision,action:'REPLY',reasonCode:verified?'VERIFIED_SERVICE_ATTRIBUTE':'SERVICE_ATTRIBUTE_UNAVAILABLE',reply,
  serviceQuestion:{field:q.field,verified:!!verified,service_id:service.id}};
}
