import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {serviceAttributeReply} from '../api/_dabbir-conversation-brain-response.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('service attribute wording remains byte-for-byte compatible at the Brain boundary',()=>{
  assert.equal(serviceAttributeReply({status:'TARGET_UNRESOLVED',field:'price',language:'ar'}),'أي خدمة تقصد؟');
  assert.equal(serviceAttributeReply({status:'TARGET_UNRESOLVED',field:'price',language:'en'}),'Which service do you mean?');
  assert.equal(serviceAttributeReply({status:'UNAVAILABLE',field:'price',label:'غسيل',language:'ar'}),'سعر غسيل غير محدد في بيانات النشاط.');
  assert.equal(serviceAttributeReply({status:'UNAVAILABLE',field:'duration_minutes',label:'Wash',language:'en'}),'The duration for Wash is not specified in the business information.');
  assert.equal(serviceAttributeReply({status:'VERIFIED',field:'price',label:'غسيل',value:40,currency:'AED',language:'ar'}),'غسيل بـ40 AED.');
  assert.equal(serviceAttributeReply({status:'VERIFIED',field:'price',label:'Wash',value:40,currency:'AED',language:'en'}),'Wash costs 40 AED.');
  assert.equal(serviceAttributeReply({status:'VERIFIED',field:'duration_minutes',label:'غسيل',value:30,language:'ar'}),'غسيل مدته 30 دقيقة.');
  assert.equal(serviceAttributeReply({status:'VERIFIED',field:'duration_minutes',label:'Wash',value:30,language:'en',resumeReply:'Continue?'}),'Wash takes 30 minutes.\nContinue?');
});

test('service question module resolves facts while Conversation Brain owns customer prose',()=>{
  const resolver=read('api/_dabbir-service-question.js');
  const response=read('api/_dabbir-conversation-brain-response.js');
  assert.match(resolver,/serviceAttributeReply/);
  assert.match(resolver,/verifiedOperationalFact/);
  assert.match(resolver,/SERVICE_QUESTION_TARGET_UNRESOLVED/);
  assert.match(resolver,/VERIFIED_SERVICE_ATTRIBUTE/);
  for(const phrase of [
    'أي خدمة تقصد؟',
    'Which service do you mean?',
    'غير محدد في بيانات النشاط.',
    'is not specified in the business information.',
    ' costs ',
    ' takes ',
    ' دقيقة.',
  ]){
    assert.equal(resolver.includes(phrase),false,`service resolver still owns customer prose: ${phrase}`);
    assert.equal(response.includes(phrase),true,`Brain response owner is missing service prose: ${phrase}`);
  }
});

test('service attribute renderer fails closed on unsupported semantic contracts',()=>{
  assert.throws(()=>serviceAttributeReply({status:'VERIFIED',field:'unknown',language:'en'}),error=>error?.code==='CONVERSATION_BRAIN_SERVICE_FIELD_UNSUPPORTED');
  assert.throws(()=>serviceAttributeReply({status:'UNKNOWN',field:'price',language:'en'}),error=>error?.code==='CONVERSATION_BRAIN_SERVICE_STATUS_UNSUPPORTED');
});
