import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isConversationNudge,
  looksLikeServiceIntent,
  previousCustomerText,
  resolveRequestedLocal,
  wantsServiceMenu,
} from '../api/_dabbir-whatsapp-understanding.js';

const fixedNow=new Date('2026-09-07T07:31:00.000Z'); // 11:31 Asia/Dubai
const timezone='Asia/Dubai';
// These helpers are still imported by the active semantic engine.
// Live presentation/selection is covered by the service-presentation suite.

test('Gulf no-space service discovery wording opens the deterministic menu',()=>{
  for(const text of ['شوعندكم','شو عندكم','وشعندكم','شنو عندكم','ايش تقدمون','شو خدماتكم']){
    assert.equal(wantsServiceMenu(text),true,text);
  }
});

test('today at five after 11:31 resolves to the only future five: 17:00',()=>{
  const result=resolveRequestedLocal('اليوم الساعه 5',timezone,{now:fixedNow});
  assert.equal(result.status,'resolved');
  assert.equal(result.local,'2026-09-07T17:00:00');
  assert.equal(result.period,'pm');
  assert.equal(result.inferred,true);
});

test('Arabic digits and implicit today follow the same future-time rule',()=>{
  const result=resolveRequestedLocal('الساعة ٥',timezone,{now:fixedNow});
  assert.equal(result.status,'resolved');
  assert.equal(result.local,'2026-09-07T17:00:00');
});

test('tomorrow at five without AM or PM stays ambiguous instead of guessing',()=>{
  const result=resolveRequestedLocal('باجر الساعة 5',timezone,{now:fixedNow});
  assert.equal(result.status,'ambiguous');
  assert.equal(result.candidates.length,2);
});

test('explicit morning and evening markers remain authoritative',()=>{
  assert.equal(resolveRequestedLocal('باجر الساعة 5 ص',timezone,{now:fixedNow}).local,'2026-09-08T05:00:00');
  assert.equal(resolveRequestedLocal('باجر الساعة 5 م',timezone,{now:fixedNow}).local,'2026-09-08T17:00:00');
  assert.equal(resolveRequestedLocal('باجر 5 العصر',timezone,{now:fixedNow}).local,'2026-09-08T17:00:00');
});

test('punctuation nudge can recover the previous customer time instead of invoking the planner',()=>{
  assert.equal(isConversationNudge('؟'),true);
  const previous=previousCustomerText([
    {sender_type:'ai',body:'متى يناسبك الموعد؟'},
    {sender_type:'customer',body:'اليوم الساعه 5'},
  ]);
  assert.equal(previous,'اليوم الساعه 5');
  assert.equal(resolveRequestedLocal(previous,timezone,{now:fixedNow}).local,'2026-09-07T17:00:00');
});

test('service-intent helper recognizes service wording without consuming human requests',()=>{
  assert.equal(looksLikeServiceIntent('ابي اغسل سياره'),true);
  assert.equal(looksLikeServiceIntent('ابي اكلم شخص'),false);
});
