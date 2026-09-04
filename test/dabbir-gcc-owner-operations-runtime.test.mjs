import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ownerOps=readFileSync(new URL('../api/owner-operations.js',import.meta.url),'utf8');
const ownerUi=readFileSync(new URL('../api/owner-operations-ui.js',import.meta.url),'utf8');
const productManagement=readFileSync(new URL('../api/owner-product-management.js',import.meta.url),'utf8');

test('Owner Operations reads neutral GCC money aliases and immutable currency snapshots',()=>{
  assert.match(ownerOps,/from '\.\/_gcc-money-core\.js'/);
  assert.match(ownerOps,/price_amount/);
  assert.match(ownerOps,/total_amount,paid_amount,currency_code/);
  assert.match(ownerOps,/unit_price_amount/);
  assert.match(ownerOps,/line_total_amount/);
  assert.match(ownerOps,/refund_amount,currency_code/);
  assert.match(ownerOps,/recognized_sales_amount/);
  assert.match(ownerOps,/cash_collected_amount/);
  assert.match(ownerOps,/receivables_amount/);
  assert.match(ownerOps,/marketDateKey/);
  assert.match(ownerOps,/assertSnapshotCurrency\(order\.currency_code,market,'ORDER'\)/);
  assert.match(ownerOps,/legacy_aed_aliases:market\.currency_code==='AED'/);
});

test('legacy AED inputs are compatibility-only and fail closed for non-AED businesses',()=>{
  assert.match(ownerOps,/market\.currency_code!=='AED'.*LEGACY_AED_INPUT_NOT_ALLOWED/s);
  assert.match(productManagement,/market\.currency_code!=='AED'.*LEGACY_AED_INPUT_NOT_ALLOWED/s);
  assert.match(ownerOps,/p_price_aed:roundMoney\(price,market\)/);
  assert.match(ownerOps,/amount_aed:roundMoney\(amount,market\)/);
  assert.match(productManagement,/price_aed:roundMoney\(price,market\)/);
});

test('Owner Operations UI consumes neutral amounts and formats the verified business market',()=>{
  assert.match(ownerUi,/data\?\.currency_code/);
  assert.match(ownerUi,/data\?\.country_code/);
  assert.match(ownerUi,/data\?\.currency_minor_units/);
  assert.match(ownerUi,/data\?\.timezone/);
  assert.match(ownerUi,/style:'currency',currency:currencyCode\(\)/);
  assert.match(ownerUi,/recognized_sales_amount/);
  assert.match(ownerUi,/product\.price_amount/);
  assert.match(ownerUi,/order\.total_amount/);
  assert.match(ownerUi,/price_amount:q\('#opsPrice'\)\.value/);
  assert.doesNotMatch(ownerUi,/recognized_sales_aed/);
  assert.doesNotMatch(ownerUi,/product\.price_aed/);
  assert.doesNotMatch(ownerUi,/order\.total_aed/);
  assert.doesNotMatch(ownerUi,/price_aed:q\('#opsPrice'\)\.value/);
});

test('Owner Product Management returns neutral product money and verifies request currency',()=>{
  assert.match(productManagement,/verifiedBusinessMarket/);
  assert.match(productManagement,/assertSnapshotCurrency\(body\.currency_code,market,'REQUEST'\)/);
  assert.match(productManagement,/select=id,business_id,sku,name,price_amount/);
  assert.match(productManagement,/select=id,sku,name,price_amount,active,metadata/);
});
