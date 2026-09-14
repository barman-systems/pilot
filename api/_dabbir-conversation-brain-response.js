export const CONVERSATION_BRAIN_RESPONSE_OWNER='DABBIR_CONVERSATION_BRAIN';

const isArabic=language=>language==='ar';
const arr=value=>Array.isArray(value)?value:[];
const entityValue=(state,key)=>state?.entities?.[key]?.value;
const structuredServiceLabel=service=>String(service?.name_ar||service?.name||service?.name_en||'').trim().slice(0,180);

export function recoveryGreetingReply(language){
  return isArabic(language)?'هلا، طلبك السابق ما اكتمل. تبا نكمل عليه؟':'Hello. Your previous request is unfinished. Would you like to continue it?';
}

export function greetingReply(language){
  return isArabic(language)?'وعليكم السلام، حياك. كيف أقدر أساعدك؟':'Hello. How can I help you?';
}

export function staleChoiceReply(language){
  return isArabic(language)?'انتهت القائمة السابقة. اكتب طلبك أو أرسل «شو خدماتكم» لعرض الخدمات من جديد.':'The previous list has expired. Tell me what you need or ask for the services again.';
}

export function plannerRecoveryReply(language){
  return isArabic(language)?'تقصد الاستفسار عن الخدمات والأسعار، أو تبا تحجز؟':'Are you asking about services and prices, or would you like to book?';
}

export function repeatMemoryConfirmationReply(language){
  return language==='en'?'Same vehicle and location, or would you like to change them?':'نفس السيارة والموقع ولا بتغير؟';
}

export function noAvailabilityReply(language){
  return isArabic(language)?'ما حصلت وقتًا متاحًا قريبًا. أي وقت آخر يناسبك؟':'No nearby time is available. What other time works for you?';
}

export function defaultServicePrompt(language){
  return isArabic(language)?'أي خدمة تحتاج؟':'Which service do you need?';
}

function deliveryModeLabel(mode,language){
  const ar={AT_BUSINESS:'في الفرع',AT_CUSTOMER:'عندك',MOBILE:'عندك',REMOTE:'عن بُعد',PICKUP:'استلام',DELIVERY:'توصيل'};
  const en={AT_BUSINESS:'at the branch',AT_CUSTOMER:'at your location',MOBILE:'at your location',REMOTE:'remotely',PICKUP:'pickup',DELIVERY:'delivery'};
  return (isArabic(language)?ar:en)[mode]||mode;
}

// The planner owns which blocking field is next. The Conversation Brain owns the
// customer-facing wording for that already-chosen focus. This renderer is pure:
// it receives presentation inputs only and cannot alter state or execution.
export function goalClarificationReply({fields=[],language='en',activity='',deliveryModes=[]}={}){
  const ar=isArabic(language),field=fields[0],activityKey=String(activity||'').toLowerCase();
  if(fields.length===2&&fields.includes('date')&&fields.includes('time'))return ar?'متى يناسبك؟ اذكر اليوم والوقت اللي تفضله.':'When works for you? Send the day and time you prefer.';
  if(field==='service')return ar?'أكيد. أي خدمة تبي بالضبط؟':'Sure. Which service would you like?';
  if(field==='delivery_mode'){
    const modes=Array.isArray(deliveryModes)?deliveryModes.filter(x=>x&&x!=='HYBRID'):[];
    if(modes.length>=2){
      const choices=modes.slice(0,3).map(mode=>deliveryModeLabel(mode,language));
      return ar?`تفضّل الخدمة ${choices.join(' أو ')}؟`:`Would you prefer the service ${choices.join(' or ')}?`;
    }
    return ar?'وين تفضّل تكون الخدمة؟':'Where would you like the service?';
  }
  if(field==='vehicle')return ar?(activityKey.includes('car')||activityKey.includes('wash')?'تمام. أي سيارة نخدم لك؟':'تمام. أي نوع يناسب طلبك؟'):(activityKey.includes('car')||activityKey.includes('wash')?'Sure. Which vehicle is this for?':'Which option fits your request?');
  if(field==='location')return ar?'تمام. وين موقع الخدمة؟':'Sure. What location should we use?';
  if(field==='property_details')return ar?'تمام. عطِني تفاصيل المكان اللي نحتاجها للخدمة.':'Sure. What property details do we need for the service?';
  if(field==='worker')return ar?'هل تفضّل موظف معيّن؟':'Do you prefer a specific staff member?';
  if(field==='date')return ar?'أي يوم يناسبك؟':'Which day works for you?';
  if(field==='time')return ar?'أي وقت يناسبك؟':'What time works for you?';
  if(field==='appointment')return ar?'أي موعد تقصد؟':'Which appointment do you mean?';
  if(field==='slot')return ar?'أي وقت من الخيارات يناسبك؟':'Which available time works for you?';
  if(field==='intent_confirmation')return ar?'تبا نكمل الطلب؟':'Would you like to continue the request?';
  return ar?'وش تحتاج مني أكمله لك؟':'What would you like me to complete for you?';
}

const exactStaticResponse=text=>{
  if(text===recoveryGreetingReply('ar'))return recoveryGreetingReply('ar');
  if(text===recoveryGreetingReply('en'))return recoveryGreetingReply('en');
  if(text===greetingReply('ar'))return greetingReply('ar');
  if(text===greetingReply('en'))return greetingReply('en');
  if(text===staleChoiceReply('ar'))return staleChoiceReply('ar');
  if(text===staleChoiceReply('en'))return staleChoiceReply('en');
  if(text===plannerRecoveryReply('ar'))return plannerRecoveryReply('ar');
  if(text===plannerRecoveryReply('en'))return plannerRecoveryReply('en');
  if(text===repeatMemoryConfirmationReply('ar'))return repeatMemoryConfirmationReply('ar');
  if(text===repeatMemoryConfirmationReply('en'))return repeatMemoryConfirmationReply('en');
  if(text===noAvailabilityReply('ar'))return noAvailabilityReply('ar');
  if(text===noAvailabilityReply('en'))return noAvailabilityReply('en');
  if(text===defaultServicePrompt('ar'))return defaultServicePrompt('ar');
  if(text===defaultServicePrompt('en'))return defaultServicePrompt('en');
  if(text==='تم إلغاء الموعد ✅.')return 'تم إلغاء الموعد ✅.';
  if(text==='Your appointment has been cancelled ✅.')return 'Your appointment has been cancelled ✅.';
  return null;
};

// Known deterministic legacy drafts are canonicalized by exact match only.
// Arbitrary Brain/model prose stays byte-for-byte unchanged.
export function finalizeCustomerResponse({text}){
  const value=typeof text==='string'?text:String(text??'');
  return exactStaticResponse(value)??value;
}

export function bookingConfirmationReply({result,language,bookingText}){
  return bookingText(result,language);
}

export function verifiedMutationReply({action,result,language,bookingText,queuedGoalPrompt=''}){
  const primary=action==='CANCEL_BOOKING'
    ?(isArabic(language)?'تم إلغاء الموعد ✅.':'Your appointment has been cancelled ✅.')
    :action==='RESCHEDULE_BOOKING'
      ?(isArabic(language)?`تم تعديل الموعد ✅ إلى ${result.starts_at}.`:`Your appointment was rescheduled ✅ to ${result.starts_at}.`)
      :bookingConfirmationReply({result,language,bookingText});
  return primary+queuedGoalPrompt;
}

export function availabilitySlotsReply({slots,language,slotsText}){
  return slotsText(slots,language);
}

export function appendAppointmentOptions(reply,lines){
  return String(reply||'')+'\n'+lines.join('\n');
}

export function appointmentOptionsReply({reply,appointments,language,timezone}){
  const locale=isArabic(language)?'ar-AE':'en-AE';
  const lines=appointments.map((appointment,index)=>`${index+1}) ${new Intl.DateTimeFormat(locale,{timeZone:timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(appointment.starts_at))}`);
  return appendAppointmentOptions(reply,lines);
}

export function serviceListReply({services,language,currencyCode,serviceLabel,resumeReply}){
  const label=typeof serviceLabel==='function'?serviceLabel:structuredServiceLabel;
  let reply=services.map((service,index)=>`${index+1}) ${label(service)} — ${service.price!=null&&Number.isFinite(Number(service.price))?Number(service.price):isArabic(language)?'السعر غير متحقق':'price unverified'} ${currencyCode||''}`).join('\n')||(isArabic(language)?'لا توجد خدمات مفعّلة حاليًا.':'There are no active services right now.');
  if(resumeReply)reply+='\n'+resumeReply;
  return reply;
}

// Compatibility core requests presentation by semantic kind only. All customer
// wording and formatting stays here; this function is pure and has no authority.
export function conversationBrainCompatibilityReply({kind,language='ar',action,result,bookingText,queuedGoalPrompt='',reply,appointments=[],timezone,services=[],currencyCode='',serviceLabel,resumeReply}={}){
  if(kind==='RECOVERY_GREETING')return recoveryGreetingReply(language);
  if(kind==='GREETING')return greetingReply(language);
  if(kind==='STALE_CHOICE')return staleChoiceReply(language);
  if(kind==='PLANNER_RECOVERY')return plannerRecoveryReply(language);
  if(kind==='VERIFIED_MUTATION')return verifiedMutationReply({action,result,language,bookingText,queuedGoalPrompt});
  if(kind==='NO_AVAILABILITY')return noAvailabilityReply(language);
  if(kind==='APPOINTMENT_OPTIONS')return appointmentOptionsReply({reply,appointments,language,timezone});
  if(kind==='SERVICE_LIST')return serviceListReply({services,language,currencyCode,serviceLabel,resumeReply});
  if(kind==='DEFAULT_SERVICE')return defaultServicePrompt(language);
  throw Object.assign(new Error('CONVERSATION_BRAIN_RESPONSE_KIND_UNSUPPORTED'),{code:'CONVERSATION_BRAIN_RESPONSE_KIND_UNSUPPORTED'});
}

function scopedServices(context){
  return arr(context?.services).filter(service=>(!service?.business_id||service.business_id===context?.business?.id)&&(!service?.branch_id||service.branch_id===context?.conversation?.branch_id));
}

function mutationActionFromPurpose(purpose){
  if(purpose==='cancel_booking')return 'CANCEL_BOOKING';
  if(purpose==='reschedule_booking')return 'RESCHEDULE_BOOKING';
  if(purpose==='create_booking')return 'CREATE_BOOKING';
  return null;
}

// Compatibility bridge: the execution core supplies only already-authorized state,
// verified receipts and presentation facts. Authoritative customer prose is rebuilt
// here without regex/fuzzy parsing or execution authority.
export function renderOperationalResponse({text,purpose,context,state,executionResult,bookingText}){
  const fallback=()=>finalizeCustomerResponse({text});
  const language=state?.language||'ar';
  const decision=state?.cognition?.decision;
  const mutationAction=mutationActionFromPurpose(purpose);

  if(mutationAction&&executionResult?.verified===true&&executionResult?.appointment_id&&typeof bookingText==='function'){
    const primary=verifiedMutationReply({action:mutationAction,result:executionResult,language,bookingText});
    const legacy=typeof text==='string'?text:String(text??'');
    // Queued-goal prose is already Brain-owned. Preserve it only when the draft
    // starts with the exact primary response derived from the verified receipt.
    if(legacy.startsWith(primary))return primary+legacy.slice(primary.length);
    return fallback();
  }

  if(purpose==='no-slots')return noAvailabilityReply(language);

  if(decision?.action==='CLARIFY'&&arr(context?.appointmentPresentation?.appointments).length){
    return appointmentOptionsReply({
      reply:decision.reply||'',
      appointments:context.appointmentPresentation.appointments,
      language,
      timezone:context?.business?.timezone,
    });
  }

  if(decision?.action==='PRICING'||decision?.action==='SERVICE_MENU'){
    const target=decision.queryServiceId||entityValue(state,'service');
    const services=scopedServices(context).filter(service=>decision.action==='SERVICE_MENU'||!target||service.id===target).slice(0,10);
    return serviceListReply({
      services,
      language,
      currencyCode:context?.business?.currency_code||'',
      resumeReply:decision.resumeReply,
    });
  }

  return fallback();
}
