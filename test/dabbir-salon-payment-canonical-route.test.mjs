import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const api=read('api/salon-operations.js');
const paymentUi=read('api/salon-payment-idempotency-ui.js');
const calendarUi=read('api/calendar-live-ui.js');

function recordPaymentBlock(){
  const start=api.indexOf("if(action==='record_payment')");
  const end=api.indexOf("if(action==='save_worker')",start);
  assert.ok(start>=0&&end>start,'record_payment block must exist');
  return api.slice(start,end);
}

test('salon record_payment uses only the canonical payment RPC',()=>{
  const block=recordPaymentBlock();
  assert.match(block,/PAYMENT_REQUEST_ID_REQUIRED/);
  assert.match(block,/rpc\(ctx\.token,'dabbir_record_operational_payment'/);
  assert.match(block,/p_idempotency_key:idempotencyKey/);
  assert.doesNotMatch(block,/rest\(ctx\.token,'dabbir_operational_payments/);
  assert.doesNotMatch(block,/on_conflict=business_id,idempotency_key/);
  assert.doesNotMatch(block,/appointment:\$\{appointmentId\}:\$\{method\}:\$\{amount\}/);
});

test('browser assigns one random request id per payment form instance',()=>{
  assert.match(paymentUi,/new WeakMap\(\)/);
  assert.match(paymentUi,/crypto\?\.randomUUID|crypto\.randomUUID/);
  assert.match(paymentUi,/payload\?\.action==='record_payment'/);
  assert.match(paymentUi,/payload\.idempotency_key=requestId/);
  assert.match(paymentUi,/requestIds\.get\(form\)/);
  assert.match(paymentUi,/requestIds\.set\(form,requestId\)/);
});

test('payment idempotency guard loads after Salon Mode UI',()=>{
  assert.match(calendarUi,/import salonPaymentIdempotencyUiHandler from '\.\/salon-payment-idempotency-ui\.js'/);
  assert.match(calendarUi,/await salonModeUiHandler\(req,salonCaptured\);await salonPaymentIdempotencyUiHandler\(req,paymentCaptured\)/);
  assert.match(calendarUi,/salonCaptured\.body\+'\\n'\+paymentCaptured\.body/);
  assert.match(calendarUi,/v13-salon-payment-idempotency/);
});
