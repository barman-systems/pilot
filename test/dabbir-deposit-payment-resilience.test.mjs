import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const resilience=fs.readFileSync(path.join(root,'supabase/migrations/20260903101500_dabbir_deposit_payment_resilience_v1.sql'),'utf8');
const commands=fs.readFileSync(path.join(root,'supabase/migrations/20260903101800_dabbir_operational_payment_rpc_v1.sql'),'utf8');
const sql=resilience+'\n'+commands;
const has=(...markers)=>{for(const marker of markers)assert.match(sql,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))};

test('deposit policy is explicit and fail closed',()=>{
  has("deposit_mode in ('fixed','percentage')","deposit_enabled=false","deposit_mode='fixed' and deposit_value>0","deposit_mode='percentage' and deposit_value>0 and deposit_value<=100",'DEPOSIT_POLICY_NOT_CONFIGURED');
});

test('booking freezes deposit amount and business currency',()=>{
  has('deposit_required_amount','deposit_currency_code','b.currency_code','m.currency_minor_units','round(v_required,v_minor_units)','BOOKING_DEPOSIT_SNAPSHOT_IMMUTABLE');
  assert.match(resilience,/v_required := least\(v_deposit_value,v_due\)/);
  assert.match(resilience,/v_required := v_due\*v_deposit_value\/100/);
});

test('external deposit booking never trusts caller payment status',()=>{
  has("new.confirmation_gate := 'deposit'","new.payment_status := 'unpaid'","new.deposit_paid_at := null","new.status := 'new'");
  assert.doesNotMatch(resilience,/new\.payment_status in \('partial','paid'\)/);
});

test('partial payment cannot confirm below frozen deposit threshold',()=>{
  has('v_net_paid>=v_required','a.deposit_required_amount',"a.confirmation_gate='deposit'");
  assert.doesNotMatch(resilience,/if v_net_paid>0 then/);
});

test('refund makes a future confirmed deposit booking unsatisfied without deleting it',()=>{
  has("when p.status='refunded' then -p.amount_aed","a.status='confirmed' and a.starts_at>now() then 'new'","deposit_paid_at=null");
  assert.doesNotMatch(resilience,/delete from public\.dabbir_appointments/i);
});

test('payment financial identity is immutable and status cannot regress',()=>{
  has('PAYMENT_IDEMPOTENCY_CONFLICT','PAYMENT_STATUS_REGRESSION',"old.status='unpaid' and new.status='paid'","old.status='paid' and new.status='refunded'");
});

test('canonical payment command requires explicit stable idempotency key',()=>{
  has('dabbir_record_operational_payment','PAYMENT_IDEMPOTENCY_KEY_REQUIRED','for update','idempotent_replay','PAYMENT_IDEMPOTENCY_CONFLICT');
  assert.match(commands,/char_length\(v_key\)<16 or char_length\(v_key\)>180/);
});

test('same payment request replays while a reused key with changed identity fails',()=>{
  assert.match(commands,/where p\.business_id=p_business_id and p\.idempotency_key=v_key[\s\S]+for update/);
  assert.match(commands,/v_existing\.appointment_id is distinct from p_appointment_id[\s\S]+v_existing\.amount_aed is distinct from p_amount[\s\S]+raise exception 'PAYMENT_IDEMPOTENCY_CONFLICT'/);
  assert.match(commands,/'idempotent_replay',true/);
});

test('refund command is itself replay safe',()=>{
  has('dabbir_refund_operational_payment',"v_payment.status='refunded'",'PAYMENT_NOT_REFUNDABLE',"set status='refunded'",'idempotent_replay');
});

test('deposit settings remain owner/admin and salon scoped',()=>{
  assert.match(commands,/m\.role in \('owner','admin'\) and b\.business_type='salon'/);
  assert.match(commands,/grant execute on function public\.dabbir_set_deposit_policy/);
});
