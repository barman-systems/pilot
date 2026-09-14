import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {semanticRouteReply} from '../api/_dabbir-conversation-brain-response.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('fixed semantic route wording is Brain-owned and byte-for-byte compatible',()=>{
  const pairs=[
    ['UNTRUSTED_INSTRUCTION','أقدر أساعدك بخدمات هذا النشاط ومواعيدك فقط.','I can help with this business and your own appointments only.'],
    ['CUSTOMER_WITHDREW_REQUEST','تمام، وقفت متابعة الطلب الحالي.','Okay, I have stopped the current request.'],
    ['BOOKING_NEGATED','ما حجزت. هل تريد اختيار وقت آخر؟','I have not booked. Would you like to choose another time?'],
    ['REFERENCE_TARGET_MISSING','أي واحد تقصد؟','Which one do you mean?'],
    ['SERVICE_DURATION_UNVERIFIED','مدة هذه الخدمة غير متحققة حاليًا.','This service duration is not verified right now.'],
    ['NO_OPERATIONAL_AUTHORITY','أقدر أساعدك بالخدمات والأسعار والحجز أو تعديل موعدك. شو تحتاج؟','I can help with services, prices, bookings or changing your appointment. What do you need?'],
  ];
  for(const [reason,ar,en] of pairs){
    assert.equal(semanticRouteReply({reason,state:{language:'ar'}}),ar);
    assert.equal(semanticRouteReply({reason,state:{language:'en'}}),en);
  }
  assert.equal(semanticRouteReply({reason:'VERIFIED_BUSINESS_KNOWLEDGE',state:{language:'ar'}}),null);
});

test('database service-duration reply is rebuilt only from scoped verified catalog facts',()=>{
  const context={business:{id:'b1'},conversation:{branch_id:'br1'},services:[
    {id:'s1',business_id:'b1',branch_id:'br1',name_ar:'غسيل كامل',name_en:'Full wash',duration_minutes:42.9},
    {id:'s1',business_id:'foreign',branch_id:'br1',name_ar:'مزيف',duration_minutes:1},
  ]};
  const ar=semanticRouteReply({reason:'DATABASE_SERVICE_DURATION',state:{language:'ar',entities:{service:{value:'s1'}}},context});
  const en=semanticRouteReply({reason:'DATABASE_SERVICE_DURATION',state:{language:'en',entities:{service:{value:'s1'}}},context});
  assert.equal(ar,'غسيل كامل مدته 42 دقيقة.');
  assert.equal(en,'غسيل كامل takes 42 minutes.');
  assert.throws(()=>semanticRouteReply({reason:'DATABASE_SERVICE_DURATION',state:{language:'ar',entities:{service:{value:'missing'}}},context}),error=>error?.code==='CONVERSATION_BRAIN_SEMANTIC_ROUTE_FACT_UNVERIFIED');
});

test('semantic facade owns every fixed core-route reply before Conversation Brain composition',()=>{
  const facade=read('api/_dabbir-semantic-engine.js');
  const response=read('api/_dabbir-conversation-brain-response.js');
  assert.match(facade,/semanticRouteReply/);
  assert.match(facade,/function ownSemanticRoute/);
  const coreCalls=(facade.match(/understandCore\(/g)||[]).length;
  const ownedCalls=(facade.match(/ownSemanticRoute\(understandCore\(/g)||[]).length;
  assert.equal(coreCalls,4);
  assert.equal(ownedCalls,4);
  for(const phrase of [
    'أقدر أساعدك بخدمات هذا النشاط ومواعيدك فقط.',
    'تمام، وقفت متابعة الطلب الحالي.',
    'ما حجزت. هل تريد اختيار وقت آخر؟',
    'أي واحد تقصد؟',
    'مدة هذه الخدمة غير متحققة حاليًا.',
    'أقدر أساعدك بالخدمات والأسعار والحجز أو تعديل موعدك. شو تحتاج؟',
  ]){
    assert.equal(facade.includes(phrase),false,`semantic facade hard-coded customer prose: ${phrase}`);
    assert.equal(response.includes(phrase),true,`Brain response owner is missing semantic route prose: ${phrase}`);
  }
});
