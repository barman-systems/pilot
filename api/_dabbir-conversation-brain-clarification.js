export const CONVERSATION_BRAIN_CLARIFICATION_OWNER='DABBIR_CONVERSATION_BRAIN';

const arr=value=>Array.isArray(value)?value:[];
const TRUSTED_PRESENTATION_SOURCES=new Set([
  'PROVIDER_VERIFIED','DATABASE_FACT','OWNER_POLICY','VERIFIED_BUSINESS_KNOWLEDGE',
  'CUSTOMER_CORRECTION','CUSTOMER_CONFIRMED','CUSTOMER_STATED','CUSTOMER_MEMORY',
]);
const activeValue=(state,key)=>state?.entities?.[key]?.status==='active'?state.entities[key].value:null;
const supported=fact=>fact?.status==='active'&&fact?.value!=null&&Number(fact.confidence)>=.9&&TRUSTED_PRESENTATION_SOURCES.has(fact.source);
const serviceLabel=service=>String(service?.name_ar||service?.name||service?.name_en||service?.display_name||'').trim().slice(0,180);
const scopedServices=context=>arr(context?.services).filter(service=>(!service?.business_id||service.business_id===context?.business?.id)&&(!service?.branch_id||service.branch_id===context?.conversation?.branch_id)&&(!service?.customer_id||service.customer_id===context?.customer?.id));
const deliveryLabel=(mode,language)=>{
  const ar={AT_BUSINESS:'في الفرع',AT_CUSTOMER:'عندك',MOBILE:'عندك',REMOTE:'عن بعد',PICKUP:'استلام',DELIVERY:'توصيل'};
  return language==='en'?mode:(ar[mode]||mode);
};

// Pure customer-presentation renderer. The semantic reducer remains authoritative
// for which field/reference is unresolved; this function only says that already-
// selected question to the customer and has no tool, transport or mutation access.
export function semanticClarificationReply(state,context,{acknowledge=true}={}){
  const en=state?.language==='en',ref=arr(state?.unresolved_references)[0],key=arr(state?.missing_fields)[0];
  if(['date','time'].includes(key)&&state?.entities?.[key]?.source==='AI_INFERENCE')return en?`Please confirm ${state.entities[key].value}?`:`للتأكيد، تقصد ${state.entities[key].value}؟`;
  if(key==='intent_confirmation')return state?.intent==='CANCEL_BOOKING'?(en?'Do you want to cancel an appointment?':'تقصد تبا تلغي موعد؟'):state?.intent==='RESCHEDULE_BOOKING'?(en?'Do you want to change an appointment?':'تقصد تبا تعدل موعد؟'):(en?'Do you want to book a service?':'تقصد تبا تحجز خدمة؟');
  if(ref==='branch')return en?'Which branch do you mean? This conversation is linked to one branch.':'أي فرع تقصد؟ هذه المحادثة مرتبطة بفرع محدد.';
  if(ref==='voice_transcript')return en?'Please confirm the unclear detail in a short text message.':'ممكن تكتب التفصيل غير الواضح في الصوت؟';
  if(ref==='verified_history')return en?'Which service did you use last time?':'أي خدمة تقصد من آخر مرة؟';
  if(ref==='vehicle')return en?'Which vehicle do you mean?':'أي سيارة تقصد؟';
  if(ref==='worker')return en?'Which staff member do you mean?':'أي موظف تقصد؟';
  if(ref==='service')return en?'Which service do you mean?':'أي خدمة تقصد؟';
  if(ref==='slot_confirmation')return en?'Do you want to book that time?':'تبا تحجز هذا الوقت؟';
  if(ref==='multiple_options'||ref==='offered_option')return en?'Which one option do you mean?':'أي خيار واحد تقصد؟';
  if(ref==='date_input')return en?'Do you mean today, tomorrow, or a specific date?':'تقصد اليوم أو باجر، أو اكتب التاريخ؟';
  if(key==='appointment'||ref==='appointment')return en?'Which appointment do you mean?':'أي موعد تقصد؟';
  if(key==='service'){
    if(state?.entities?.service?.source==='AI_INFERENCE'&&state.entities.service.label)return en?`Do you mean ${state.entities.service.label}?`:`تقصد ${state.entities.service.label}؟`;
    const names=arr(state?.entities?.service?.candidates).map(item=>item?.label).filter(Boolean).slice(0,2);
    return names.length===2?(en?`Do you mean ${names[0]} or ${names[1]}?`:`تقصد ${names[0]} أو ${names[1]}؟`):(en?'Which service would you like?':'أي خدمة تبا؟');
  }
  if(key==='date')return en?'Which day works for you?':'أي يوم يناسبك؟';
  if(key==='time'){
    const fact=state?.entities?.time;
    if(fact?.part==='after_maghrib')return en?'What exact time after sunset works for you?':'أي ساعة تناسبك بعد المغرب؟';
    if(fact?.part==='after_asr')return en?'What exact time in the afternoon works for you?':'أي ساعة تناسبك بعد العصر؟';
    if(fact?.part==='am_pm')return en?`Do you mean ${fact.hour} AM or PM?`:`تقصد الساعة ${fact.hour} صباحًا أو مساءً؟`;
    return en?'What time works for you?':'أي وقت يناسبك؟';
  }
  if(key==='worker')return en?'Which staff member would you prefer?':'أي موظف تفضل؟';
  if(key==='delivery_mode'||ref==='delivery_mode'){
    const modes=arr(state?.activity_requirements?.contract?.delivery_modes);
    return en?'Where would you like this service: '+modes.join(' / ')+'?':'وين تبا الخدمة: '+modes.map(mode=>deliveryLabel(mode,'ar')).join(' / ')+'؟';
  }
  if(['location','vehicle','property_details'].includes(key)){
    const fact=state?.entities?.[key];
    if(fact?.source==='AI_INFERENCE')return en?'Please confirm: '+String(fact.value)+'?':'للتأكيد، تقصد '+String(fact.value)+'؟';
    const definition=state?.activity_requirements?.contract?.entity_definitions?.[key];
    const question=definition?.[en?'question_en':'question_ar']||(en?'Please provide '+key:'ما تفاصيل '+key+'؟');
    const service=scopedServices(context).find(item=>item.id===activeValue(state,'service'));
    const known=[service?serviceLabel(service):null,supported(state?.entities?.date)?activeValue(state,'date'):null,supported(state?.entities?.time)?(en?'at ':'الساعة ')+activeValue(state,'time'):null].filter(Boolean);
    return acknowledge&&known.length?(en?'Got it: ':'تمام، ')+known.join('، ')+'. '+question:question;
  }
  return en?'Which detail should I use?':'أي تفصيل تقصد؟';
}
