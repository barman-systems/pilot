import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeSemanticText,sanitizeSemanticContext} from '../api/_dabbir-semantic-privacy.js';

test('provider boundary removes credentials and operational identifiers pasted into customer language',()=>{
 const text='أبا VIP باجر الساعة 5 Bearer private-test-token api_key=test-secret sk-proj-EXAMPLEKEY123 eyJtest.payload.signature 10000000-0000-4000-8000-000000000001';
 const safe=sanitizeSemanticText(text);
 assert.match(safe,/أبا VIP باجر الساعة 5/);
 for(const secret of ['private-test-token','test-secret','EXAMPLEKEY123','eyJtest','10000000-0000'])assert.ok(!safe.includes(secret));
});
test('nested provider context is bounded and strips secret fields without changing required facts',()=>{
 const safe=sanitizeSemanticContext({activity:{required:['vehicle','location'],delivery_mode:'MOBILE'},history:[{body:'password=private-example نفس السيارة'}],api_key:'private',customer:{latitude:24.1,longitude:54.1},large:Array(100).fill('x')});
 assert.deepEqual(safe.activity,{required:['vehicle','location'],delivery_mode:'MOBILE'});
 assert.equal(safe.api_key,undefined);assert.deepEqual(safe.customer,{});assert.equal(safe.large.length,20);
 assert.match(safe.history[0].body,/نفس السيارة/);assert.ok(!JSON.stringify(safe).includes('private'));
});
