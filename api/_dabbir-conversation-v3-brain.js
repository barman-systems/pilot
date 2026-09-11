import {assertFactRetentionV3,assertDialoguePlanV3,brainResponseV3} from './_dabbir-conversation-v3-invariants.js';
const arr=v=>Array.isArray(v)?v:[];
const clean=(v,n=500)=>String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').slice(0,n);
const mapFacts=facts=>new Map(arr(facts).filter(f=>f?.status==='VERIFIED'&&f.field).map(f=>[f.field,{...f}]));
const factValue=(state,field)=>mapFacts(state?.facts).get(field)?.value??null;
const scopedServices=context=>arr(context?.services).filter(s=>(!s?.business_id||s.business_id===context?.business?.id)&&(!s?.branch_id||s.branch_id===context?.conversation?.branch_id));
const profileServices=context=>arr(context?.activity_profile?.services).filter(s=>(!s?.business_id||s.business_id===context?.business?.id)&&(!s?.branch_id||s.branch_id===context?.conversation?.branch_id));
const serviceRow=(context,id)=>scopedServices(context).find(s=>s.id===id)||null;
const contractFor=(context,id)=>profileServices(context).find(s=>s.service_id===id)||null;
const serviceLabel=(context,id)=>{const s=serviceRow(context,id);return clean(s?.name_ar||s?.name||s?.name_en,120)||null;};
const currency=context=>clean(context?.business?.currency_code||'AED',8);
const arabic=context=>!String(context?.conversation?.language||context?.customer?.language||'ar').toLowerCase().startsWith('en');

function requirementsFor(state,context){
  if(state.goal!=='BOOK_SERVICE')return [];
  const values=mapFacts(state.facts),serviceId=values.get('service')?.value;
  if(!serviceId)return ['service'];
  const contract=contractFor(context,serviceId),required=[];
  const mode=values.get('delivery_mode')?.value;
  if(!mode&&arr(contract?.delivery_modes).length>1)required.push('delivery_mode');
  for(const field of arr(contract?.mode_requirements?.[mode]?.required))if(!required.includes(field))required.push(field);
  if(mode==='MOBILE'&&contract?.entity_definitions?.location&&!required.includes('location'))required.push('location');
  if(String(contract?.booking_model||contract?.operating_model||'').toUpperCase()==='APPOINTMENT'){
    if(contract?.entity_definitions?.date&&!required.includes('date'))required.push('date');
    if(contract?.entity_definitions?.time&&!required.includes('time'))required.push('time');
  }
  return required;
}
function summaryParts(state,context){
  const values=mapFacts(state.facts),out=[];
  const service=serviceLabel(context,values.get('service')?.value);if(service)out.push(service);
  if(values.get('delivery_mode')?.value==='MOBILE')out.push('متنقل');
  if(values.get('immediacy')?.value==='NOW')out.push('الحين');
  const vehicle=values.get('vehicle')?.value;if(vehicle)out.push(vehicle==='station'?'سيارة ستيشن/SUV':vehicle==='saloon'?'سيارة صالون':`السيارة ${clean(vehicle,80)}`);
  return out;
}
function tentativeVehicle(state){return arr(state.tentatives).find(x=>x.field==='vehicle')||null;}
function answerSideQuestions(understanding,state,context){
  const answers=[];const serviceId=factValue(state,'service'),row=serviceRow(context,serviceId);
  for(const q of arr(understanding.side_questions)){
    if(q.type==='price'&&row&&Number.isFinite(Number(row.price)))answers.push({type:'price',value:Number(row.price),currency:currency(context),service_label:serviceLabel(context,serviceId)});
    if(q.type==='duration'&&row&&Number.isFinite(Number(row.duration_minutes??row.duration)))answers.push({type:'duration',value:Number(row.duration_minutes??row.duration)});
  }
  return answers;
}
function chooseQuestion(state,missing){
  const vehicle=tentativeVehicle(state);
  if(vehicle)return {fields:['vehicle'],purpose:vehicle.candidate_value?'CONFIRM_TENTATIVE_VEHICLE':'MAP_TENTATIVE_VEHICLE',candidate_value:vehicle.candidate_value,surface:vehicle.surface};
  if(missing.includes('service'))return {fields:['service'],purpose:'COLLECT_SERVICE'};
  if(missing.includes('vehicle')&&missing.includes('location'))return {fields:['vehicle','location'],purpose:'COLLECT_VEHICLE_AND_LOCATION'};
  if(missing.includes('vehicle'))return {fields:['vehicle'],purpose:'COLLECT_VEHICLE'};
  if(missing.includes('location'))return {fields:['location'],purpose:'COLLECT_LOCATION'};
  if(missing.includes('date')||missing.includes('time'))return {fields:['date','time'].filter(x=>missing.includes(x)),purpose:'COLLECT_WHEN'};
  if(missing.length)return {fields:[missing[0]],purpose:'COLLECT_REQUIRED'};
  return null;
}
function renderArabic({state,plan,context}){
  const parts=summaryParts(state,context),answer=plan.answers?.[0]||null,vehicle=tentativeVehicle(state),q=plan.next_question;
  const segments=[];
  if(answer?.type==='price')segments.push(`${answer.service_label||'الخدمة'} ${answer.value} ${answer.currency==='AED'?'درهم':answer.currency}.`);
  if(parts.length)segments.push(`تمام، فهمت: ${parts.join('، ')}.`);
  else segments.push('تمام.');
  if(vehicle){
    if(vehicle.candidate_value){
      const label=vehicle.candidate_value==='station'?'ستيشن/SUV':vehicle.candidate_value==='saloon'?'صالون':clean(vehicle.surface,100)||'هذا النوع';
      segments.push(`فهمت إن السيارة ${label} — صح؟`);
      if(plan.missing_fields.includes('location'))segments.push('إذا نعم، أرسل موقعك من خيار الموقع في واتساب.');
    }else{
      const surface=clean(vehicle.surface,100)||'هذا النوع';
      segments.push(`فهمت إن السيارة ${surface}، لكن تصنيفنا صالون أو ستيشن/SUV. أي فئة نعتمد؟`);
    }
    return segments.join(' ');
  }
  if(q?.purpose==='COLLECT_SERVICE')segments.push('أي خدمة تبي بالضبط؟');
  else if(q?.purpose==='COLLECT_VEHICLE_AND_LOCATION')segments.push('سيارتك صالون ولا ستيشن/SUV؟ وأرسل موقعك من خيار الموقع في واتساب.');
  else if(q?.purpose==='COLLECT_VEHICLE')segments.push('سيارتك صالون ولا ستيشن/SUV؟');
  else if(q?.purpose==='COLLECT_LOCATION')segments.push('باقي موقعك بس — أرسله من خيار الموقع في واتساب.');
  else if(q?.purpose==='COLLECT_WHEN')segments.push('متى يناسبك؟');
  else if(q)segments.push('أعطني المعلومة الباقية عشان أكمل لك.');
  else segments.push('المعلومات الأساسية واضحة عندي.');
  return segments.join(' ');
}
function renderEnglish({state,plan,context}){
  const service=serviceLabel(context,factValue(state,'service')),q=plan.next_question,segments=[];
  if(plan.answers?.[0]?.type==='price')segments.push(`${service||'The service'} is ${plan.answers[0].value} ${plan.answers[0].currency}.`);
  if(service)segments.push(`Got it: ${service}.`);else segments.push('Got it.');
  if(q?.purpose==='COLLECT_SERVICE')segments.push('Which service would you like?');
  else if(q?.purpose==='CONFIRM_TENTATIVE_VEHICLE')segments.push('I understood the vehicle as station/SUV — is that right?');
  else if(q?.purpose==='COLLECT_VEHICLE_AND_LOCATION')segments.push('Is the vehicle a saloon/sedan or station/SUV? Then send your WhatsApp location.');
  else if(q?.purpose==='COLLECT_VEHICLE')segments.push('Is the vehicle a saloon/sedan or station/SUV?');
  else if(q?.purpose==='COLLECT_LOCATION')segments.push('I only need your service location — send it using WhatsApp Location.');
  else if(q?.purpose==='COLLECT_WHEN')segments.push('When would you like it?');
  return segments.join(' ');
}

export function planConversationTurnV3({previousState,understanding,episode,context}){
  const previous=previousState||{facts:[],tentatives:[],goal:'UNKNOWN',intent_confirmed:false};
  const invalidations=[...(episode?.kind==='NEW_EPISODE'?arr(previous.facts).filter(f=>f?.status==='VERIFIED').map(f=>({field:f.field,reason:'NEW_EPISODE'})):[]),...arr(understanding.invalidations)];
  const state={version:2,episode_id:episode?.kind==='NEW_EPISODE'?`${clean(context?.conversation?.id,80)}:${understanding.turn.created_at}`:previous.episode_id||`${clean(context?.conversation?.id,80)}:${understanding.turn.created_at}`,
    episode_started_at:episode?.kind==='NEW_EPISODE'?understanding.turn.created_at:previous.episode_started_at||understanding.turn.created_at,last_turn_at:understanding.turn.created_at,
    episode_boundary:{kind:episode?.kind||'CONTINUE',reason:episode?.reason||'UNKNOWN',idle_ms:episode?.idle_ms??null},goal:understanding.goal||previous.goal||'UNKNOWN',
    intent_confirmed:episode?.kind==='NEW_EPISODE'?understanding.signals.booking_intent_strong===true:(previous.intent_confirmed===true||understanding.signals.booking_intent_strong===true),
    facts:understanding.facts.map(f=>({...f})),tentatives:understanding.tentatives.map(f=>({...f})),invalidations,pending_question:null};
  if(episode?.kind!=='NEW_EPISODE')assertFactRetentionV3({before:previous,after:state});
  const required=requirementsFor(state,context),verified=mapFacts(state.facts),missing=required.filter(field=>!verified.has(field));
  const answers=answerSideQuestions(understanding,state,context),nextQuestion=chooseQuestion(state,missing);
  const plan={version:2,goal:state.goal,intent_confirmed:state.intent_confirmed,answers,missing_fields:missing,required_fields:required,next_question:nextQuestion,
    surfaced_facts:summaryParts(state,context),surfaced_tentative_fields:arr(state.tentatives).map(x=>x.field),proposed_action:missing.length?'CLARIFY':'READY_FOR_AUTHORITY',response_parts:{acknowledgement:'ACK',understanding_summary:true,answer:answers.length>0,assumption:!!tentativeVehicle(state),question:nextQuestion?.purpose||null}};
  state.pending_question=nextQuestion?{fields:nextQuestion.fields,purpose:nextQuestion.purpose}:null;
  const text=arabic(context)?renderArabic({state,plan,context}):renderEnglish({state,plan,context});
  const response=brainResponseV3({text,plan_id:`${state.episode_id}:${understanding.turn.message_id||'turn'}`,metadata:{goal:state.goal}});
  assertDialoguePlanV3({plan,state,response});
  return {state,plan,response};
}
