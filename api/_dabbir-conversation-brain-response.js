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

export function repeatMemoryConfirmationReply(language){
  return language==='en'?'Same vehicle and location, or would you like to change them?':'نفس السيارة والموقع ولا بتغير؟';
}

export function noAvailabilityReply(language){
  return isArabic(language)?'ما حصلت وقتًا متاحًا قريبًا. أي وقت آخر يناسبك؟':'No nearby time is available. What other time works for you?';
}

export function defaultServicePrompt(language){
  return isArabic(language)?'أي خدمة تحتاج؟':'Which service do you need?';
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

// Known deterministic legacy drafts are now canonicalized here by exact match.
// Arbitrary Brain/model prose is deliberately passed through byte-for-byte; there
// is no fuzzy matching, heuristic rewriting, or downstream intent inference.
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

export function serviceListReply({services,language,currencyCode,serviceLabel,resumeReply}){
  let reply=services.map((service,index)=>`${index+1}) ${serviceLabel(service)} — ${service.price!=null&&Number.isFinite(Number(service.price))?Number(service.price):isArabic(language)?'السعر غير متحقق':'price unverified'} ${currencyCode||''}`).join('\n')||(isArabic(language)?'لا توجد خدمات مفعّلة حاليًا.':'There are no active services right now.');
  if(resumeReply)reply+='\n'+resumeReply;
  return reply;
}
