import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyClinicMessage, classifyCelebrityMessage } from '../api/pilot-runtime.js';

test('clinic appointment intent', () => {
  assert.equal(classifyClinicMessage('أريد حجز موعد غداً'), 'APPOINTMENT_REQUEST');
});

test('clinic follow-up intent', () => {
  assert.equal(classifyClinicMessage('احتاج متابعة'), 'FOLLOW_UP');
});

test('celebrity advertising intent', () => {
  assert.equal(classifyCelebrityMessage('لدينا إعلان وحملة جديدة'), 'ADVERTISING_REQUEST');
});

test('celebrity collaboration intent', () => {
  assert.equal(classifyCelebrityMessage('نرغب في تعاون'), 'COLLABORATION_REQUEST');
});

test('celebrity invitation intent', () => {
  assert.equal(classifyCelebrityMessage('دعوة لحضور فعالية'), 'INVITATION');
});
