import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  isConversationNudge,
  looksLikeBookingAvailability,
  looksLikeServiceIntent,
  previousCustomerText,
  resolveRequestedLocal,
  wantsServiceMenu,
} from '../api/_dabbir-whatsapp-understanding.js';

const fixedNow=new Date('2026-09-07T07:31:00.000Z'); // 11:31 Asia/Dubai
const timezone='Asia/Dubai';
const menuSource=fs.readFileSync(new URL('../api/_dabbir-whatsapp-service-menu.js',import.meta.url),'utf8');

test('Gulf no-space service discovery wording opens the deterministic menu',()=>{
  for(const text of ['شوعندكم','شو عندكم','وشعندكم','شنو عندكم','ايش تقدمون','شو خدماتكم']){
    assert.equal(wantsServiceMenu(text),true,text);
  }
});

test('explicit Gulf scheduling availability is recognized without treating product stock as booking intent',()=>{
  for(const text of ['فاضين بكره 9 الصبح','فاضين باجر 5 المسا','عندكم وقت اليوم 17:00','في موعد باجر الصبح','any slots tomorrow morning','are you free tomorrow 9 am']){
    assert.equal(looksLikeBookingAvailability(text),true,text);
  }
  for(const text of ['هل المنتج متوفر بكرة؟','المنتج متوفر اليوم','شو عندكم بكره','كم سعر المنتج بكره','فاضين؟','any products available tomorrow']){
    assert.equal(looksLikeBookingAvailability(text),false,text);
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
  assert.match(menuSource,/previousCustomerText\(context\?\.history\)/);
  assert.match(menuSource,/isConversationNudge\(text\)/);
});

test('an unavailable service-like request routes to the verified catalog instead of planner guessing',()=>{
  assert.equal(looksLikeServiceIntent('ابي اغسل سياره'),true);
  assert.equal(looksLikeServiceIntent('ابي اكلم شخص'),false);
  assert.match(menuSource,/if\(looksLikeServiceIntent\(text\)\)/);
  assert.match(menuSource,/sendServiceMenu\(claim,context,lang\)/);
});
