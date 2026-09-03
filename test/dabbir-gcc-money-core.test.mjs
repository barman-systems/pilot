import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const precision=fs.readFileSync('supabase/migrations/20260903192233_dabbir_gcc_money_precision_v2.sql','utf8');
const rounding=fs.readFileSync('supabase/migrations/20260903192355_dabbir_gcc_commission_rounding_v1.sql','utf8');
const snapshot=fs.readFileSync('supabase/migrations/20260903192500_dabbir_gcc_currency_snapshot_v1.sql','utf8');

test('GCC money core preserves three-decimal currencies without breaking legacy writers',()=>{
  for(const column of ['unit_price_aed','quoted_price_aed','visit_fee_aed','amount_aed','total_aed','paid_aed','refund_aed','price_aed']){
    assert.match(precision,new RegExp(`alter column ${column} type numeric\\(14,3\\)`,'i'));
  }
  assert.doesNotMatch(precision,/type numeric\(14,2\)/i);
  const drop=precision.indexOf('drop trigger if exists dabbir_operational_payment_status_sync');
  const alter=precision.indexOf('alter table public.dabbir_operational_payments');
  const recreate=precision.lastIndexOf('create trigger dabbir_operational_payment_status_sync');
  assert.ok(drop>=0&&drop<alter&&alter<recreate,'amount trigger must be dropped only around the compatible type change');
});

test('commission rounding follows market minor units and fails closed on source drift',()=>{
  assert.match(rounding,/business_currency_minor_units\(p_business_id uuid\)/);
  assert.match(rounding,/m\.currency_minor_units::integer/);
  assert.match(rounding,/m\.currency_code=b\.currency_code/);
  assert.match(rounding,/if v_count <> 2 then/);
  assert.match(rounding,/COMMISSION_ROUNDING_SOURCE_DRIFT/);
  assert.match(rounding,/business_currency_minor_units\(new\.business_id\)/);
  assert.doesNotMatch(rounding,/end,2\).*execute v_def/is);
});

test('financial records freeze ISO currency and expose neutral amount aliases',()=>{
  for(const table of ['dabbir_orders','dabbir_operational_payments','dabbir_expenses','dabbir_financial_evidence','dabbir_commissions','dabbir_car_wash_booking_requests','dabbir_order_returns']){
    assert.match(snapshot,new RegExp(`alter table public\\.${table} add column if not exists currency_code text`));
    assert.match(snapshot,new RegExp(`alter table public\\.${table} alter column currency_code set not null`));
  }
  assert.match(snapshot,/MONEY_SNAPSHOT_CURRENCY_IMMUTABLE/);
  assert.match(snapshot,/BUSINESS_CURRENCY_MISMATCH/);
  assert.match(snapshot,/APPOINTMENT_CURRENCY_MISMATCH/);
  assert.match(snapshot,/ORDER_CURRENCY_MISMATCH/);
  for(const alias of ['price_amount','quoted_price_amount','total_amount','paid_amount','refund_amount','revenue_amount','commission_amount','salon_gross_amount','default_visit_fee_amount','quoted_price_amount','buffer_threshold_amount']){
    assert.match(snapshot,new RegExp(`add column if not exists ${alias} numeric\\(14,3\\) generated always as`,'i'));
  }
  assert.match(snapshot,/dabbir_appointments add column if not exists currency_code text generated always as \(deposit_currency_code\) stored/);
  assert.doesNotMatch(snapshot,/currency_code\s+text\s+not null\s+default\s+'AED'/i);
});
