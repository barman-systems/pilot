import test from 'node:test';
import assert from 'node:assert/strict';
import {_aiFailureTest} from '../api/_dabbir-whatsapp-ai-core.js';

test('stored WhatsApp AI text preserves intentional line breaks and blank list spacing',()=>{
  const input='المواعيد المتاحة — الأربعاء، 16 سبتمبر:\r\n\r\n1. 8:00 ص\r\n2. 8:30 ص\r\n3. 9:00 ص\r\n\r\nاختر رقم الموعد (1، 2، 3).';
  const stored=_aiFailureTest.messageText(input);
  assert.equal(stored,'المواعيد المتاحة — الأربعاء، 16 سبتمبر:\n\n1. 8:00 ص\n2. 8:30 ص\n3. 9:00 ص\n\nاختر رقم الموعد (1، 2، 3).');
  assert.ok(stored.includes('\n1. 8:00 ص\n2. 8:30 ص\n3. 9:00 ص\n'));
});

test('message storage still removes unsafe control characters without flattening layout',()=>{
  const stored=_aiFailureTest.messageText('الخدمات المتاحة:\n1. خارجي\u0000\n2. عادي\t');
  assert.equal(stored,'الخدمات المتاحة:\n1. خارجي \n2. عادي');
});
