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
const isConversationGoal=g=>['BOOK_SERVICE','DISCOVER_SERVICE','PRICE_SERVICE','SUPPORT','UNKNOWN'].includes(g);

function serviceOptions(context){return scopedServices(context).slice(0,6).map(s=>({type:'service',id:s.id,label:clean(s?.name_ar||s?.name||s?.name_en,120),price:Number.isFinite(Number(s?.price))?Number(s.price):null,currency:currency(context)})).filter(x=>x.label);}
function requirementsFor(state,context){
  if(state.goal!=='BOOK_SERVICE')return [];
  const values=mapFacts(state.facts),serviceId=values.get('service')?.value;if(!serviceId)return ['service'];
  const contract=contractFor(context,serviceId),required=[],mode=values.get('delivery_mode')?.value;
  if(!mode&&arr(contract?.delivery_modes).length>1)required.push('delivery_mode');
  for(const field of arr(contract?.mode_requirements?.[mode]?.required))if(!required.includes(field))required.push(field);
  if(mode==='MOBILE'&&contract?.entity_definitions?.location&&!required.includes('location'))required.push('location');
  if(String(contract?.booking_model||contract?.operating_model||'').toUpperCase()==='APPOINTMENT'){if(contract?.entity_definitions?.date&&!required.includes('date'))required.push('date');if(contract?.entity_definitions?.time&&!required.includes('time'))required.push('time');}
  return required;
}
function summaryParts(state,context){const values=mapFacts(state.facts),out=[];const service=serviceLabel(context,values.get('service')?.value);if(service)out.push(service);if(values.get('delivery_mode')?.value==='MOBILE')out.push('متنقل');if(values.get('immediacy')?.value==='NOW')out.push('الحين');const vehicle=values.get('vehicle')?.value;if(vehicle)out.push(vehicle==='station'?'سيارة ستيشن/SUV':vehicle==='saloon'?'سيارة صالون':`السيارة ${clean(vehicle,80)}`);return out;}
function tentativeByField(state,field){return arr(state.tentatives).find(x=>x.field===field)||null;}
function tentativeVehicle(state){return tentativeByField(state,'vehicle');}
function tentativeService(state){return tentativeByField(state,'service');}
function answerSideQuestions(understanding,state,context){const answers=[];const serviceId=factValue(state,'service'),row=serviceRow(context,serviceId);for(const q of arr(understanding.side_questions)){if(q.type==='price'&&row&&Number.isFinite(Number(row.price)))answers.push({type:'price',value:Number(row.price),currency:currency(context),service_label:serviceLabel(context,serviceId)});if(q.type==='duration_minutes'&&row&&Number.isFinite(Number(row.duration_minutes??row.duration)))answers.push({type:'duration',value:Number(row.duration_minutes??row.duration)});}return answers;}
function chooseQuestion(state,missing,context){
  const vehicle=tentativeVehicle(state),service=tentativeService(state);
  if(service)return {fields:['service'],purpose:service.candidate_value?'CONFIRM_TENTATIVE_SERVICE':'MAP_TENTATIVE_SERVICE',candidate_value:service.candidate_value,surface:service.surface,options:serviceOptions(context)};
  if(vehicle)return {fields:['vehicle'],purpose:vehicle.candidate_value?'CONFIRM_TENTATIVE_VEHICLE':'MAP_TENTATIVE_VEHICLE',candidate_value:vehicle.candidate_value,surface:vehicle.surface};
  if(missing.includes('service'))return {fields:['service'],purpose:'COLLECT_SERVICE',options:serviceOptions(context)};
  if(missing.includes('vehicle')&&missing.includes('location'))return {fields:['vehicle','location'],purpose:'COLLECT_VEHICLE_AND_LOCATION'};
  if(missing.includes('vehicle'))return {fields:['vehicle'],purpose:'COLLECT_VEHICLE'};
  if(missing.includes('location'))return {fields:['location'],purpose:'COLLECT_LOCATION'};
  if(missing.includes('date')||missing.includes('time'))return {fields:['date','time'].filter(x=>missing.includes(x)),purpose:'COLLECT_WHEN'};
  if(missing.length)return {fields:[missing[0]],purpose:'COLLECT_REQUIRED'};
  return null;
}
function menuArabic(options){return options.map((x,i)=>`${i+1}) ${x.label}${x.price!=null?` — ${x.price} ${x.currency==='AED'?'درهم':x.currency}`:''}`).join('، ');}
function menuEnglish(options){return options.map((x,i)=>`${i+1}) ${x.label}${x.price!=null?` — ${x.price} ${x.currency}`:''}`).join(', ');}
function serviceCandidateSummary(context,tentative){const row=serviceRow(context,tentative?.candidate_value);if(!row)return null;return {label:clean(row?.name_ar||row?.name||row?.name_en,120),price:Number.isFinite(Number(row?.price))?Number(row.price):null,currency:currency(context)};}
function renderArabic({state,plan,context,understanding}){
  const parts=summaryParts(state,context),answer=plan.answers?.[0]||null,vehicle=tentativeVehicle(state),serviceTentative=tentativeService(state),q=plan.next_question;
  if(understanding?.role==='GREETING'&&['SUPPORT','UNKNOWN'].includes(state.goal))return 'هلا، حياك. كيف أقدر أساعدك؟';
  if(understanding?.role==='SOCIAL'&&['SUPPORT','UNKNOWN'].includes(state.goal))return 'حياك. قل لي وش تحتاج وبساعدك.';
  const segments=[];if(answer?.type==='price')segments.push(`${answer.service_label||'الخدمة'} ${answer.value} ${answer.currency==='AED'?'درهم':answer.currency}.`);if(parts.length)segments.push(`فهمت عليك: ${parts.join('، ')}.`);
  if(serviceTentative){
    if(q?.purpose==='CONFIRM_TENTATIVE_SERVICE'){
      const candidate=serviceCandidateSummary(context,serviceTentative),surface=clean(serviceTentative.surface,100)||candidate?.label||'الخدمة';
      if(candidate)segments.push(`فهمت «${surface}» على أنها ${candidate.label}${candidate.price!=null?` بـ${candidate.price} ${candidate.currency==='AED'?'درهم':candidate.currency}`:''} — هذا قصدك؟`);
      else segments.push(`فهمت «${surface}» كخدمة محتملة — هذا قصدك؟`);
    }else{
      const surface=clean(serviceTentative.surface,100)||'الخدمة اللي ذكرتها',options=arr(q?.options);segments.push(`فهمت إنك تقصد «${surface}»، لكن ما قدرت أربطها بخدمة واحدة بثقة.`);if(options.length)segments.push(`عندنا ${menuArabic(options)}. أي واحد تقصد؟`);else segments.push('وضح لي اسم الخدمة شوي؟');
    }
    return segments.join(' ');
  }
  if(vehicle){
    if(vehicle.candidate_value){const label=vehicle.candidate_value==='station'?'ستيشن/SUV':vehicle.candidate_value==='saloon'?'صالون':clean(vehicle.surface,100)||'هذا النوع';segments.push(`فهمت إن السيارة ${label} — صح؟`);if(plan.missing_fields.includes('location'))segments.push('إذا صحيح، أرسل موقعك من خيار الموقع في واتساب وبكمل لك.');}
    else{const surface=clean(vehicle.surface,100)||'هذا النوع';segments.push(`فهمت السيارة «${surface}»، لكن أحتاج أحدد فئتها عندنا: صالون أو ستيشن/SUV؟`);}return segments.join(' ');
  }
  if(q?.purpose==='COLLECT_SERVICE'){const options=arr(q.options);if(options.length)segments.push(`عندنا ${menuArabic(options)}. أي واحد تبي؟`);else segments.push('أي خدمة تبي بالضبط؟');}
  else if(q?.purpose==='COLLECT_VEHICLE_AND_LOCATION')segments.push('قل لي نوع السيارة: صالون أو ستيشن/SUV، وأرسل موقعك من خيار الموقع في واتساب.');
  else if(q?.purpose==='COLLECT_VEHICLE')segments.push('السيارة صالون أو ستيشن/SUV؟');
  else if(q?.purpose==='COLLECT_LOCATION')segments.push('باقي موقعك بس — أرسله من خيار الموقع في واتساب وبكمل لك.');
  else if(q?.purpose==='COLLECT_WHEN')segments.push('متى تبيه؟');
  else if(q)segments.push('أعطني المعلومة الباقية وبكمل لك.');
  else if(state.goal==='DISCOVER_SERVICE'){const options=serviceOptions(context);segments.push(options.length?`الخدمات المتاحة: ${menuArabic(options)}. إذا تبا تحجز، قل لي أي واحد.`:'ما عندي خدمات مفعّلة أقدر أعرضها لك الآن.');}
  else if(state.goal==='PRICE_SERVICE'&&!answer){const options=serviceOptions(context);segments.push(options.length?`حدد الخدمة عشان أعطيك السعر الصحيح: ${menuArabic(options)}. أي واحد تقصد؟`:'حدد لي الخدمة اللي تسأل عن سعرها.');}
  else if(state.goal==='SUPPORT')segments.push('قل لي وش تحتاج وبساعدك.');else if(state.goal==='BOOK_SERVICE')segments.push('المعلومات المطلوبة للحجز مكتملة عندي.');else segments.push('قل لي وش تحتاج وبساعدك.');return segments.join(' ');
}
function renderEnglish({state,plan,context,understanding}){
  if(understanding?.role==='GREETING'&&['SUPPORT','UNKNOWN'].includes(state.goal))return 'Hi. How can I help?';
  const service=serviceLabel(context,factValue(state,'service')),q=plan.next_question,serviceTentative=tentativeService(state),segments=[];
  if(plan.answers?.[0]?.type==='price')segments.push(`${service||'The service'} is ${plan.answers[0].value} ${plan.answers[0].currency}.`);if(service)segments.push(`Got it: ${service}.`);
  if(serviceTentative&&q?.purpose==='CONFIRM_TENTATIVE_SERVICE'){const candidate=serviceCandidateSummary(context,serviceTentative);segments.push(candidate?`I understood “${clean(serviceTentative.surface,100)}” as ${candidate.label}${candidate.price!=null?` at ${candidate.price} ${candidate.currency}`:''} — is that what you mean?`:`I have a possible service match for “${clean(serviceTentative.surface,100)}” — is that right?`);}
  else if(q?.purpose==='COLLECT_SERVICE'){const options=arr(q.options);segments.push(options.length?`Available services: ${menuEnglish(options)}. Which one would you like?`:'Which service would you like?');}
  else if(q?.purpose==='MAP_TENTATIVE_SERVICE'){const options=arr(q.options);segments.push(`I could not safely map “${clean(tentativeService(state)?.surface,100)}” to one service.${options.length?` Available: ${menuEnglish(options)}. Which one do you mean?`:' Please clarify the service.'}`);}
  else if(q?.purpose==='CONFIRM_TENTATIVE_VEHICLE')segments.push('I understood the vehicle as station/SUV — is that right?');
  else if(q?.purpose==='COLLECT_VEHICLE_AND_LOCATION')segments.push('Is the vehicle saloon/sedan or station/SUV? Then send your WhatsApp location.');
  else if(q?.purpose==='COLLECT_VEHICLE')segments.push('Is the vehicle saloon/sedan or station/SUV?');
  else if(q?.purpose==='COLLECT_LOCATION')segments.push('I only need your service location — send it using WhatsApp Location.');
  else if(q?.purpose==='COLLECT_WHEN')segments.push('When would you like it?');
  else if(state.goal==='DISCOVER_SERVICE'){const options=serviceOptions(context);segments.push(options.length?`Available services: ${menuEnglish(options)}.`:'No active services are available to show right now.');}
  else if(state.goal==='SUPPORT')segments.push('Tell me what you need and I will help.');else if(state.goal==='BOOK_SERVICE')segments.push('I have the required booking details.');return segments.join(' ');
}

export function planConversationTurnV3({previousState,understanding,episode,context}){
  const previous=previousState||{facts:[],tentatives:[],goal:'UNKNOWN',intent_confirmed:false};
  const invalidations=[...(episode?.kind==='NEW_EPISODE'?arr(previous.facts).filter(f=>f?.status==='VERIFIED').map(f=>({field:f.field,reason:'NEW_EPISODE'})):[]),...arr(understanding.invalidations)];
  const state={version:2,episode_id:episode?.kind==='NEW_EPISODE'?`${clean(context?.conversation?.id,80)}:${understanding.turn.created_at}`:previous.episode_id||`${clean(context?.conversation?.id,80)}:${understanding.turn.created_at}`,episode_started_at:episode?.kind==='NEW_EPISODE'?understanding.turn.created_at:previous.episode_started_at||understanding.turn.created_at,last_turn_at:understanding.turn.created_at,episode_boundary:{kind:episode?.kind||'CONTINUE',reason:episode?.reason||'UNKNOWN',idle_ms:episode?.idle_ms??null},goal:understanding.goal||previous.goal||'UNKNOWN',intent_confirmed:episode?.kind==='NEW_EPISODE'?understanding.signals.booking_intent_strong===true:(previous.intent_confirmed===true||understanding.signals.booking_intent_strong===true),facts:understanding.facts.map(f=>({...f})),tentatives:understanding.tentatives.map(f=>({...f})),invalidations,pending_question:null};
  if(episode?.kind!=='NEW_EPISODE')assertFactRetentionV3({before:previous,after:state});
  const required=requirementsFor(state,context),verified=mapFacts(state.facts),missing=required.filter(field=>!verified.has(field)),answers=answerSideQuestions(understanding,state,context);let nextQuestion=chooseQuestion(state,missing,context);
  if(state.goal==='DISCOVER_SERVICE'&&!verified.has('service'))nextQuestion=tentativeService(state)?nextQuestion:{fields:['service'],purpose:'COLLECT_SERVICE',options:serviceOptions(context)};
  if(state.goal==='PRICE_SERVICE'&&!verified.has('service'))nextQuestion=tentativeService(state)?nextQuestion:{fields:['service'],purpose:'COLLECT_SERVICE',options:serviceOptions(context)};
  if(['SUPPORT','UNKNOWN'].includes(state.goal)&&['GREETING','SOCIAL'].includes(understanding.role))nextQuestion=null;
  let proposedAction=missing.length?'CLARIFY':'READY_FOR_AUTHORITY';if(!isConversationGoal(state.goal))proposedAction=missing.length?'CLARIFY':'READY_FOR_AUTHORITY';else if(['SUPPORT','UNKNOWN','DISCOVER_SERVICE','PRICE_SERVICE'].includes(state.goal))proposedAction='REPLY';
  const plan={version:3,goal:state.goal,intent_confirmed:state.intent_confirmed,answers,missing_fields:missing,required_fields:required,next_question:nextQuestion,surfaced_facts:summaryParts(state,context),surfaced_tentative_fields:arr(state.tentatives).map(x=>x.field),proposed_action:proposedAction,response_parts:{acknowledgement:'ACK',understanding_summary:true,answer:answers.length>0,assumption:!!tentativeVehicle(state)||!!tentativeService(state),question:nextQuestion?.purpose||null}};
  state.pending_question=nextQuestion?{fields:nextQuestion.fields,purpose:nextQuestion.purpose,...(nextQuestion.candidate_value?{candidate_value:nextQuestion.candidate_value}:{}),...(arr(nextQuestion.options).length?{options:nextQuestion.options.map(x=>({...x}))}:{})}:null;
  const text=arabic(context)?renderArabic({state,plan,context,understanding}):renderEnglish({state,plan,context,understanding});const response=brainResponseV3({text,plan_id:`${state.episode_id}:${understanding.turn.message_id||'turn'}`,metadata:{goal:state.goal,engine:'V3'}});assertDialoguePlanV3({plan,state,response});return {state,plan,response};
}
