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
  verifiedMutationReply,
  noAvailabilityReply,
  availabilitySlotsReply,
  appendAppointmentOptions,
  serviceListReply,
  defaultServicePrompt,
} from '../api/_dabbir-conversation-brain-response.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'api/_dabbir-conversation-brain-response.js'),'utf8');

test('response renderer is explicitly conversation-brain owned and pure',()=>{
  assert.equal(CONVERSATION_BRAIN_RESPONSE_OWNER,'DABBIR_CONVERSATION_BRAIN');
  assert.equal(finalizeCustomerResponse({text:'نفس الرد',purpose:'reply'}),'نفس الرد');
  for(const forbidden of [
    'dabbir_semantic_execute_v2',
    'dabbir_semantic_commit_v2',
    'dabbir_whatsapp_ai_check_availability',
    'deliver(',
    'handoff(',
    'process.env',
  ])assert.equal(source.includes(forbidden),false,`response renderer gained authority: ${forbidden}`);
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
});

test('verified execution wording remains compatible and only consumes verified result data',()=>{
  const bookingText=(result,lang)=>`${lang}:${result.appointment_id}`;
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
