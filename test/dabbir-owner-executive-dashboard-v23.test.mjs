import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync(new URL('../api/owner-command-center-v23.js',import.meta.url),'utf8');
const active=fs.readFileSync(new URL('../api/owner-command-center-v29.js',import.meta.url),'utf8');
const gateway=fs.readFileSync(new URL('../api/owner-dashboard-gateway.js',import.meta.url),'utf8');
const data=fs.readFileSync(new URL('../api/owner-dashboard-data.js',import.meta.url),'utf8');
const broker=fs.readFileSync(new URL('../supabase/functions/dabbir-owner-broker/index.ts',import.meta.url),'utf8');

test('v23 remains the executive truth layer under the active reviewed owner dashboard',()=>{
  assert.match(gateway,/owner-command-center-v29\.js/);
  assert.match(active,/owner-command-center-v28\.js/);
  assert.match(ui,/owner-command-center-v22\.js/);
  assert.match(ui,/ownerExecutiveV23/);
  assert.match(ui,/version:'v23-complete'/);
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

test('revenue management explicitly covers the requested SaaS measures without treating sandbox as live revenue',()=>{
  for(const token of ['MRR','ARR','Trial→Paid','Churn','Refunds','صافي الإيراد','توقع نهاية الشهر','حسب النشاط','حسب الدولة','Live Revenue Ledger'])assert.match(ui,new RegExp(token));
  for(const field of ['mrr_aed','arr_aed','trial_to_paid_conversion','churn_rate','failed_payments','refunds','net_revenue_aed','month_end_forecast_aed','by_business_type','by_country'])assert.match(ui,new RegExp(field));
});

test('reliability and release management surface uptime, release identity, post-deploy health and rollback truth',()=>{
  for(const token of ['Uptime','API latency','Database RPC latency','5xx','Backup','Restore test','وقت النشر','من نفّذ النشر','أخطاء بعد النشر','الإصدار السابق','Rollback'])assert.match(ui,new RegExp(token));
  assert.match(ui,/NEEDS RELEASE TIMESTAMP INSTRUMENTATION/);
  assert.match(ui,/NEEDS RELEASE ACTOR INSTRUMENTATION/);
  assert.match(ui,/Vercel rollback candidate محفوظ/);
});

test('voice of customer has a decision pipeline rather than a feedback-only inbox',()=>{
  for(const token of ['Capture','Aggregate','Recurrence','Impact','Priority','Product Decision','Result Measurement','NEEDS PRODUCT IMPACT INSTRUMENTATION','NEEDS PRODUCT PRIORITY LINK','NEEDS DECISION LINK','NEEDS OUTCOME LINK'])assert.match(ui,new RegExp(token));
});

test('weekly review names improvements, regressions, top risks and next decisions deterministically',()=>{
  for(const token of ['ما تحسن','ما تراجع','أعلى المخاطر','قرارات الأسبوع التالي','accounts_delta','businesses_delta','first_value_delta','feedback_delta'])assert.match(ui,new RegExp(token));
});

test('decision center carries owner priority and due-date semantics',()=>{
  assert.match(ui,/BARMAN Executive OS/);
  assert.match(ui,/Priority:/);
  assert.match(ui,/Due:/);
  assert.match(ui,/NEEDS TASK SLA INSTRUMENTATION/);
  assert.match(ui,/الأولوية/);
  assert.match(ui,/موعد الاستحقاق/);
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
  assert.match(broker,/dabbir_platform_owner_executive_v2/);
  assert.match(broker,/verifySession/);
  assert.match(broker,/database_rpc_latency_ms/);
});

test('health and instrumentation gaps remain explicit instead of invented',()=>{
  for(const token of ['runtime_5xx_state','backup_state','restore_test_state','database_rpc_latency_ms'])assert.match(ui,new RegExp(token));
  assert.match(ui,/Operational Health حتمي وليس توقع Churn/);
  assert.doesNotMatch(ui,/Math\.random|fake|synthetic/i);
});
