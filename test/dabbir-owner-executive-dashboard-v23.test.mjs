import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync(new URL('../api/owner-command-center-v23.js',import.meta.url),'utf8');
const gateway=fs.readFileSync(new URL('../api/owner-dashboard-gateway.js',import.meta.url),'utf8');
const data=fs.readFileSync(new URL('../api/owner-dashboard-data.js',import.meta.url),'utf8');
const broker=fs.readFileSync(new URL('../supabase/functions/dabbir-owner-broker/index.ts',import.meta.url),'utf8');

test('v23 routes authenticated owner dashboard through executive layer',()=>{
  assert.match(gateway,/owner-command-center-v23\.js/);
  assert.match(ui,/owner-command-center-v22\.js/);
  assert.match(ui,/ownerExecutiveV23/);
});

test('v23 exposes all executive management surfaces with truth-only states',()=>{
  for(const phrase of ['نبض دبّر','الإيرادات','صحة العملاء','المخاطر','القرارات المطلوبة','Funnel','Reliability Center','Release Management','Voice of Customer','Weekly Executive Review','Customer Health','Decision & Task Center'])assert.match(ui,new RegExp(phrase));
  assert.match(ui,/owner-dashboard-data\?action=executive/);
  assert.match(ui,/SANDBOX/);
  assert.match(ui,/Stripe الحالي Sandbox\/Test/);
  assert.match(ui,/NEEDS INSTRUMENTATION/);
  assert.match(ui,/NEEDS_LOGIN_INSTRUMENTATION/);
  assert.doesNotMatch(ui,/Math\.random|fake metric|synthetic metric/i);
});

test('v23 remains responsive for iPhone-sized viewports',()=>{
  assert.match(ui,/@media\(max-width:700px\)/);
  assert.match(ui,/@media\(max-width:390px\)/);
  assert.match(ui,/grid-template-columns:1fr/);
});

test('executive data remains brokered and owner-session protected',()=>{
  assert.match(data,/\['overview','search','executive'\]/);
  assert.match(data,/__Host-dabbir_owner_session/);
  assert.match(data,/action:'owner_data'/);
  assert.doesNotMatch(data,/SUPABASE_SERVICE_ROLE_KEY|apikey:|authorization:`Bearer/);
  assert.match(broker,/action==='executive'/);
  assert.match(broker,/dabbir_platform_owner_executive_v1/);
  assert.match(broker,/verifySession/);
  assert.match(broker,/database_rpc_latency_ms/);
});

test('revenue and reliability gaps are explicit instead of invented',()=>{
  for(const token of ['mrr_aed','arr_aed','runtime_5xx_state','backup_state','restore_test_state','database_rpc_latency_ms'])assert.match(ui,new RegExp(token));
  assert.match(ui,/Vercel rollback candidate محفوظ/);
  assert.match(ui,/Operational Health حتمي وليس توقع Churn/);
});
