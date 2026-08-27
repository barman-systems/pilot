import test from 'node:test';
import assert from 'node:assert/strict';
import { redactLogEvent, REDACTED } from '../api/_observability.js';

test('observability redacts sensitive keys recursively',()=>{
  const event=redactLogEvent({
    operation:'privacy_export',
    access_token:'secret-token',
    nested:{refresh_token:'refresh-me',email:'owner@example.com',phone_number:'+971501234567',message_body:'hello'},
    business_id:'13863744-4655-440f-bf9a-12b2e0e40e94',
  });
  assert.equal(event.access_token,REDACTED);
  assert.equal(event.nested.refresh_token,REDACTED);
  assert.equal(event.nested.email,REDACTED);
  assert.equal(event.nested.phone_number,REDACTED);
  assert.equal(event.nested.message_body,REDACTED);
  assert.equal(event.business_id,'13863744-4655-440f-bf9a-12b2e0e40e94');
});

test('observability redacts secrets embedded in otherwise safe strings',()=>{
  const event=redactLogEvent({
    detail:'contact owner@example.com or +971501234567 using Bearer abc.def.ghi',
    failure:'JWT eyJabcdefghijk.abcdefghijk.abcdefghijk was rejected',
  });
  assert.doesNotMatch(event.detail,/owner@example\.com|971501234567|Bearer abc/);
  assert.doesNotMatch(event.failure,/eyJabcdefghijk/);
  assert.match(event.detail,/\[REDACTED\]/);
});

test('observability bounds nested payload size and depth',()=>{
  const tooDeep={};let node=tooDeep;
  for(let i=0;i<12;i++){node.next={};node=node.next}
  const event=redactLogEvent({items:Array.from({length:80},(_,i)=>i),tooDeep,long:'x'.repeat(4000)});
  assert.equal(event.items.length,50);
  assert.equal(event.long.length,2000);
  assert.match(JSON.stringify(event.tooDeep),/TRUNCATED_DEPTH/);
});
