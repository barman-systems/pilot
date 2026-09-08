import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const meter=fs.readFileSync(new URL('../api/_dabbir-whatsapp-ai-meter.js',import.meta.url),'utf8');
const whatsapp=fs.readFileSync(new URL('../api/_dabbir-whatsapp-ai-core.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260907133700_dabbir_ai_customer_cost_metering_v1.sql',import.meta.url),'utf8');

test('WhatsApp AI routes through the per-business meter',()=>{
  assert.match(whatsapp,/\.\/_dabbir-whatsapp-ai-meter\.js/);
  assert.match(whatsapp,/business:\{id:clean\(context\?\.business\?\.id/);
  assert.match(whatsapp,/conversation:\{id:clean\(context\?\.conversation\?\.id/);
  assert.match(whatsapp,/batch_message_created_at/);
});

test('meter preserves paid fallback and attributes Vercel spend to the business',()=>{
  assert.match(meter,/provider==='vercel-ai-gateway'/);
  assert.match(meter,/PAID_FALLBACK/);
  assert.match(meter,/user:identity\.businessId/);
  assert.match(meter,/channel:whatsapp/);
  assert.match(meter,/dabbir_record_ai_usage_v1/);
  assert.match(meter,/VERCEL_REPORT_RECONCILIATION_REQUIRED/);
  assert.doesNotMatch(meter,/actualCostUsd==null\?0/);
});

test('authoritative ledger exposes per-business channel provider model and explicit unpriced operations',()=>{
  for(const field of ['ai_channel','ai_provider','ai_model','ai_input_tokens','ai_output_tokens','ai_reasoning_tokens','ai_cost_source'])assert.match(migration,new RegExp(field));
  assert.match(migration,/dabbir_ai_customer_cost_monthly_v1/);
  assert.match(migration,/unpriced_operations/);
  assert.match(migration,/business_id/);
  assert.match(migration,/on conflict \(business_id,operation_key\) do update/i);
});
