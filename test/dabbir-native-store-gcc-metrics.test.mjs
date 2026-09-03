import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

test('native store GET preserves the tenant handler but recalculates day metrics from the business timezone',()=>{
  const source=read('api/mobile/owner-operations.js');
  for(const token of ['ownerOperationsHandler','requireNativeBearer','currency_code,timezone,phone_country_prefix','localDateKey','businessDate','todayOrders','todayReturns','today_expenses_aed','store_metrics_are_business_day_facts:true'])assert.match(source,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(source,/timeZone:timezone/);
  assert.doesNotMatch(source,/timeZone:'Asia\/Dubai'/);
});

test('native store response exposes currency-aware aliases without renaming the legacy ledger columns',()=>{
  const source=read('api/mobile/owner-operations.js');
  for(const token of ['sales_today=','returned_today=','net_sales_today=','today_expenses=','recognized_sales=','cash_collected=','receivables=','currency_code=business.currency_code','legacy_aed_field_names_are_storage_compatibility:true'])assert.match(source,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});
