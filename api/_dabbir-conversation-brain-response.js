export const CONVERSATION_BRAIN_RESPONSE_OWNER='DABBIR_CONVERSATION_BRAIN';

const isArabic=language=>language==='ar';

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

export function verifiedMutationReply({action,result,language,bookingText,queuedGoalPrompt=''}){
  const primary=action==='CANCEL_BOOKING'
    ?(isArabic(language)?'تم إلغاء الموعد ✅.':'Your appointment has been cancelled ✅.')
    :action==='RESCHEDULE_BOOKING'
      ?(isArabic(language)?`تم تعديل الموعد ✅ إلى ${result.starts_at}.`:`Your appointment was rescheduled ✅ to ${result.starts_at}.`)
      :bookingText(result,language);
  return primary+queuedGoalPrompt;
}

export function noAvailabilityReply(language){
  return isArabic(language)?'ما حصلت وقتًا متاحًا قريبًا. أي وقت آخر يناسبك؟':'No nearby time is available. What other time works for you?';
}

export function availabilitySlotsReply({slots,language,slotsText}){
  return slotsText(slots,language);
}

export function appendAppointmentOptions(reply,lines){
  return String(reply||'')+'\n'+lines.join('\n');
}

export function serviceListReply({services,language,currencyCode,serviceLabel,resumeReply}){
  let reply=services.map((service,index)=>`${index+1}) ${serviceLabel(service)} — ${service.price!=null&&Number.isFinite(Number(service.price))?Number(service.price):isArabic(language)?'السعر غير متحقق':'price unverified'} ${currencyCode||''}`).join('\n')||(isArabic(language)?'لا توجد خدمات مفعّلة حاليًا.':'There are no active services right now.');
  if(resumeReply)reply+='\n'+resumeReply;
  return reply;
}

export function defaultServicePrompt(language){
  return isArabic(language)?'أي خدمة تحتاج؟':'Which service do you need?';
}
