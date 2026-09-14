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
  appointmentOptionsReply,
  serviceListReply,
  defaultServicePrompt,
  goalClarificationReply,
  conversationBrainCompatibilityReply,
  renderOperationalResponse,
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

test('compatibility core requests Brain-owned prose by semantic kind and unknown kinds fail closed',()=>{
  const bookingText=(result,lang)=>`${lang}:${result.appointment_id}`;
  assert.equal(conversationBrainCompatibilityReply({kind:'GREETING',language:'ar'}),greetingReply('ar'));
  assert.equal(conversationBrainCompatibilityReply({kind:'NO_AVAILABILITY',language:'en'}),noAvailabilityReply('en'));
  assert.equal(conversationBrainCompatibilityReply({kind:'VERIFIED_MUTATION',action:'CREATE_BOOKING',result:{appointment_id:'a1'},language:'ar',bookingText,queuedGoalPrompt:'\nالتالي'}),'ar:a1\nالتالي');
  assert.throws(()=>conversationBrainCompatibilityReply({kind:'UNKNOWN'}),error=>error?.code==='CONVERSATION_BRAIN_RESPONSE_KIND_UNSUPPORTED');
});

test('operational mutation reply is rebuilt only from verified receipt and preserves Brain-owned queue suffix',()=>{
  const state={language:'ar',cognition:{decision:{action:'RESCHEDULE_BOOKING'}}};
  const result={verified:true,appointment_id:'a1',starts_at:'2026-09-15T10:00:00+04:00'};
  const primary='تم تعديل الموعد ✅ إلى 2026-09-15T10:00:00+04:00.';
  const legacy=primary+'\nوبخصوص الحجز التالي: أي وقت يناسبك؟';
  assert.equal(renderOperationalResponse({text:legacy,purpose:'reschedule_booking',state,executionResult:result,context:{},bookingText:()=>''}),legacy);
  assert.equal(renderOperationalResponse({text:'legacy-unverified',purpose:'reschedule_booking',state,executionResult:{verified:false},context:{},bookingText:()=>''}),'legacy-unverified');
});

test('appointment options are rendered from committed decision plus structured presentation, not legacy lines',()=>{
  const context={
    business:{timezone:'UTC'},
    appointmentPresentation:{appointments:[{id:'a1',starts_at:'2026-09-15T10:00:00Z'},{id:'a2',starts_at:'2026-09-16T12:30:00Z'}]},
  };
  const state={language:'en',cognition:{decision:{action:'CLARIFY',reply:'Which appointment?'}}};
  const expected=appointmentOptionsReply({reply:'Which appointment?',appointments:context.appointmentPresentation.appointments,language:'en',timezone:'UTC'});
  assert.equal(renderOperationalResponse({text:'legacy lines must not win',purpose:'clarify',context,state}),expected);
});

test('service menu and pricing are rendered from scoped structured services',()=>{
  const context={
    business:{id:'b1',currency_code:'AED'},conversation:{branch_id:'br1'},
    services:[
      {id:'s1',business_id:'b1',branch_id:'br1',name_ar:'غسيل',price:40},
      {id:'s2',business_id:'b1',branch_id:'br1',name_ar:'تلميع',price:60},
      {id:'foreign',business_id:'b2',branch_id:'br1',name_ar:'خارجي',price:1},
    ],
  };
  const menuState={language:'ar',cognition:{decision:{action:'SERVICE_MENU',resumeReply:'نكمل؟'}}};
  assert.equal(renderOperationalResponse({text:'legacy',purpose:'reply',context,state:menuState}),'1) غسيل — 40 AED\n2) تلميع — 60 AED\nنكمل؟');
  const pricingState={language:'ar',entities:{service:{value:'s2'}},cognition:{decision:{action:'PRICING',queryServiceId:'s2'}}};
  assert.equal(renderOperationalResponse({text:'legacy',purpose:'reply',context,state:pricingState}),'1) تلميع — 60 AED');
});
