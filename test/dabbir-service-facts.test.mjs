import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveServiceFactReply} from '../api/_dabbir-service-facts.js';

const services=[
  {id:'1',name:'Vip',duration_minutes:45,price:100},
  {id:'2',name:'خارجي',duration_minutes:30,price:40},
  {id:'3',name:'عادي',duration_minutes:30,price:60},
];

test('specific Arabic duration question returns the database duration, not the service menu',()=>{
  const result=resolveServiceFactReply({messages:[{body:'كم مدة الغسيل العادي'}],state:{language:'ar',intent:'SERVICE_DISCOVERY',entities:{}},services});
  assert.equal(result.action,'REPLY');
  assert.equal(result.reasonCode,'SERVICE_DURATION_DATABASE_FACT');
  assert.equal(result.reply,'مدة عادي 30 دقيقة.');
  assert.doesNotMatch(result.reply,/AED|100|60|40/);
});

test('duration follow-up uses the already grounded service',()=>{
  const result=resolveServiceFactReply({messages:[{body:'كم تاخذون وقت للغسيل'}],state:{language:'ar',intent:'BOOKING',entities:{service:{value:'3'}},missing_fields:['vehicle']},services});
  assert.equal(result.reply,'مدة عادي 30 دقيقة.');
  assert.deepEqual(result.missingFields,['vehicle']);
  assert.equal(result.intent,'BOOKING');
});

test('generic duration question lists durations rather than prices',()=>{
  const result=resolveServiceFactReply({messages:[{body:'كم مدة الخدمات'}],state:{language:'ar',intent:'SERVICE_DISCOVERY',entities:{}},services});
  assert.match(result.reply,/Vip — 45 دقيقة/);
  assert.match(result.reply,/خارجي — 30 دقيقة/);
  assert.match(result.reply,/عادي — 30 دقيقة/);
});

test('ordinary service discovery is not hijacked by the duration fact reader',()=>{
  const result=resolveServiceFactReply({messages:[{body:'شو خدماتكم'}],state:{language:'ar'},services});
  assert.equal(result,null);
});
