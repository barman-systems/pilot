import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  CONVERSATION_BRAIN_RESPONSE_OWNER,
  finalizeCustomerResponse,
  recoveryGreetingReply,
  greetingReply,
  staleChoiceReply,
  plannerRecoveryReply,
  repeatMemoryConfirmationReply,
  bookingConfirmationReply,
  verifiedMutationReply,
  noAvailabilityReply,
  availabilitySlotsReply,
  appendAppointmentOptions,
  serviceListReply,
  defaultServicePrompt,
  goalClarificationReply,
} from '../api/_dabbir-conversation-brain-response.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'api/_dabbir-conversation-brain-response.js'),'utf8');

test('response renderer is explicitly conversation-brain owned and pure',()=>{
  assert.equal(CONVERSATION_BRAIN_RESPONSE_OWNER,'DABBIR_CONVERSATION_BRAIN');
  for(const forbidden of [
    'dabbir_semantic_execute_v2',
    'dabbir_semantic_commit_v2',
    'dabbir_whatsapp_ai_check_availability',
    'deliver(',
    'handoff(',
    'process.env',
  ])assert.equal(source.includes(forbidden),false,`response renderer gained authority: ${forbidden}`);
});

test('known deterministic legacy drafts are canonicalized by exact match only',()=>{
  const known=[
    [recoveryGreetingReply,'ar'],[recoveryGreetingReply,'en'],
    [greetingReply,'ar'],[greetingReply,'en'],
    [staleChoiceReply,'ar'],[staleChoiceReply,'en'],
    [plannerRecoveryReply,'ar'],[plannerRecoveryReply,'en'],
    [repeatMemoryConfirmationReply,'ar'],[repeatMemoryConfirmationReply,'en'],
    [noAvailabilityReply,'ar'],[noAvailabilityReply,'en'],
    [defaultServicePrompt,'ar'],[defaultServicePrompt,'en'],
  ];
  for(const [render,language] of known){
    const text=render(language);
    assert.equal(finalizeCustomerResponse({text,purpose:'reply'}),text);
  }
  assert.equal(finalizeCustomerResponse({text:'تم إلغاء الموعد ✅.',purpose:'cancel_booking'}),'تم إلغاء الموعد ✅.');
  assert.equal(finalizeCustomerResponse({text:'Your appointment has been cancelled ✅.',purpose:'cancel_booking'}),'Your appointment has been cancelled ✅.');
  assert.equal(finalizeCustomerResponse({text:'رد خاص من Brain',purpose:'reply'}),'رد خاص من Brain');
  assert.equal(finalizeCustomerResponse({text:'هلا، طلبك السابق ما اكتمل. تبا نكمل عليه؟!',purpose:'reply'}),'هلا، طلبك السابق ما اكتمل. تبا نكمل عليه؟!');
});

test('deterministic shortcut wording remains byte-for-byte compatible',()=>{
  assert.equal(recoveryGreetingReply('ar'),'هلا، طلبك السابق ما اكتمل. تبا نكمل عليه؟');
  assert.equal(recoveryGreetingReply('en'),'Hello. Your previous request is unfinished. Would you like to continue it?');
  assert.equal(greetingReply('ar'),'وعليكم السلام، حياك. كيف أقدر أساعدك؟');
  assert.equal(greetingReply('en'),'Hello. How can I help you?');
  assert.equal(staleChoiceReply('ar'),'انتهت القائمة السابقة. اكتب طلبك أو أرسل «شو خدماتكم» لعرض الخدمات من جديد.');
  assert.equal(staleChoiceReply('en'),'The previous list has expired. Tell me what you need or ask for the services again.');
  assert.equal(plannerRecoveryReply('ar'),'تقصد الاستفسار عن الخدمات والأسعار، أو تبا تحجز؟');
  assert.equal(plannerRecoveryReply('en'),'Are you asking about services and prices, or would you like to book?');
  assert.equal(repeatMemoryConfirmationReply('ar'),'نفس السيارة والموقع ولا بتغير؟');
  assert.equal(repeatMemoryConfirmationReply('en'),'Same vehicle and location, or would you like to change them?');
});

test('goal clarification wording remains byte-for-byte compatible',()=>{
  assert.equal(goalClarificationReply({fields:['service'],language:'ar'}),'أكيد. أي خدمة تبي بالضبط؟');
  assert.equal(goalClarificationReply({fields:['service'],language:'en'}),'Sure. Which service would you like?');
  assert.equal(goalClarificationReply({fields:['date','time'],language:'ar'}),'متى يناسبك؟ اذكر اليوم والوقت اللي تفضله.');
  assert.equal(goalClarificationReply({fields:['date','time'],language:'en'}),'When works for you? Send the day and time you prefer.');
  assert.equal(goalClarificationReply({fields:['vehicle'],language:'ar',activity:'car_wash'}),'تمام. أي سيارة نخدم لك؟');
  assert.equal(goalClarificationReply({fields:['vehicle'],language:'en',activity:'car_wash'}),'Sure. Which vehicle is this for?');
  assert.equal(goalClarificationReply({fields:['delivery_mode'],language:'ar',deliveryModes:['AT_BUSINESS','MOBILE']}),'تفضّل الخدمة في الفرع أو عندك؟');
  assert.equal(goalClarificationReply({fields:['delivery_mode'],language:'en',deliveryModes:['AT_BUSINESS','REMOTE']}),'Would you prefer the service at the branch or remotely?');
  assert.equal(goalClarificationReply({fields:['location'],language:'ar'}),'تمام. وين موقع الخدمة؟');
  assert.equal(goalClarificationReply({fields:['time'],language:'en'}),'What time works for you?');
});

test('verified execution wording remains compatible and only consumes verified result data',()=>{
  const bookingText=(result,lang)=>`${lang}:${result.appointment_id}`;
  assert.equal(bookingConfirmationReply({result:{appointment_id:'a1'},language:'ar',bookingText}),'ar:a1');
  assert.equal(verifiedMutationReply({action:'CANCEL_BOOKING',result:{},language:'ar',bookingText}),'تم إلغاء الموعد ✅.');
  assert.equal(verifiedMutationReply({action:'CANCEL_BOOKING',result:{},language:'en',bookingText}),'Your appointment has been cancelled ✅.');
  assert.equal(verifiedMutationReply({action:'RESCHEDULE_BOOKING',result:{starts_at:'2026-09-15T10:00:00+04:00'},language:'ar',bookingText}),'تم تعديل الموعد ✅ إلى 2026-09-15T10:00:00+04:00.');
  assert.equal(verifiedMutationReply({action:'RESCHEDULE_BOOKING',result:{starts_at:'2026-09-15T10:00:00+04:00'},language:'en',bookingText}),'Your appointment was rescheduled ✅ to 2026-09-15T10:00:00+04:00.');
  assert.equal(verifiedMutationReply({action:'CREATE_BOOKING',result:{appointment_id:'a1'},language:'ar',bookingText,queuedGoalPrompt:'\nالتالي'}),'ar:a1\nالتالي');
});

test('availability, appointment and service presentation wording remains compatible',()=>{
  assert.equal(noAvailabilityReply('ar'),'ما حصلت وقتًا متاحًا قريبًا. أي وقت آخر يناسبك؟');
  assert.equal(noAvailabilityReply('en'),'No nearby time is available. What other time works for you?');
  assert.equal(availabilitySlotsReply({slots:[1,2],language:'ar',slotsText:(slots,lang)=>`${lang}:${slots.join(',')}`}),'ar:1,2');
  assert.equal(appendAppointmentOptions('اختر الموعد',['1) A','2) B']),'اختر الموعد\n1) A\n2) B');
  const services=[{name_ar:'غسيل',price:40},{name_ar:'تلميع',price:null}];
  const serviceLabel=s=>s.name_ar;
  assert.equal(serviceListReply({services,language:'ar',currencyCode:'AED',serviceLabel,resumeReply:'نكمل؟'}),'1) غسيل — 40 AED\n2) تلميع — السعر غير متحقق AED\nنكمل؟');
  assert.equal(serviceListReply({services:[],language:'en',currencyCode:'AED',serviceLabel}),'There are no active services right now.');
  assert.equal(defaultServicePrompt('ar'),'أي خدمة تحتاج؟');
  assert.equal(defaultServicePrompt('en'),'Which service do you need?');
});
