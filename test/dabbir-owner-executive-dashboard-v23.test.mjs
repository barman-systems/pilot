import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync(new URL('../api/owner-command-center-v23.js',import.meta.url),'utf8');
const active=fs.readFileSync(new URL('../api/owner-command-center-v29.js',import.meta.url),'utf8');
const gateway=fs.readFileSync(new URL('../api/owner-dashboard-gateway.js',import.meta.url),'utf8');
const data=fs.readFileSync(new URL('../api/owner-dashboard-data.js',import.meta.url),'utf8');
const broker=fs.readFileSync(new URL('../supabase/functions/dabbir-owner-broker/index.ts',import.meta.url),'utf8');

test('v23 adds an executive workspace with business, money, customers and health',()=>{
  assert.match(ui,/ownerExecutiveV23/);
  for(const token of ['الأعمال','المال','العملاء','الصحة'])assert.match(ui,new RegExp(token));
  assert.match(active,/owner-command-center-v28/);
  assert.match(gateway,/owner-command-center\.js/);
});

test('executive dashboard distinguishes measured facts from instrumentation gaps',()=>{
  assert.match(ui,/NEEDS INSTRUMENTATION/);
  assert.match(ui,/MEASURED_AT_BROKER/);
  assert.match(ui,/database_rpc_latency_state/);
  assert.match(ui,/runtime_5xx_state/);
  assert.match(ui,/backup_state/);
  assert.match(ui,/restore_test_state/);
});

test('executive dashboard exposes attention, risk and decision queues',()=>{
  for(const token of ['ownerAttention','ownerRisks','ownerDecisions'])assert.match(ui,new RegExp(token));
  assert.match(ui,/قرارات تنتظر المالك/);
  assert.match(ui,/مخاطر التشغيل/);
});

test('executive dashboard exposes CEO command state without fake completion',()=>{
  assert.match(ui,/ownerCeo/);
  assert.match(ui,/ما الذي ينفذ الآن/);
  assert.match(ui,/آخر إجراء/);
  assert.match(ui,/الخطوة التالية/);
  assert.match(ui,/موعد الاستحقاق/);
});

test('v23 remains responsive for iPhone-sized viewports',()=>{
  assert.match(ui,/@media\(max-width:700px\)/);
  assert.match(ui,/@media\(max-width:390px\)/);
  assert.match(ui,/grid-template-columns:1fr/);
});

test('executive data remains brokered, session protected and root-gated',()=>{
  assert.match(data,/\['overview','search','executive'\]/);
  assert.match(data,/__Host-dabbir_owner_session/);
  assert.match(data,/action:'owner_data'/);
  assert.doesNotMatch(data,/SUPABASE_SERVICE_ROLE_KEY|apikey:|authorization:`Bearer/);
  assert.match(broker,/action==='executive'/);
  assert.match(broker,/dabbir_platform_owner_executive_v2/);
  assert.match(broker,/requireRoot\(session\)/);
  assert.match(broker,/verifySession/);
  assert.match(broker,/database_rpc_latency_ms/);
});

test('health and instrumentation gaps remain explicit instead of invented',()=>{
  for(const token of ['runtime_5xx_state','backup_state','restore_test_state','database_rpc_latency_ms'])assert.match(ui,new RegExp(token));
  assert.match(ui,/Operational Health حتمي وليس توقع Churn/);
  assert.doesNotMatch(ui,/Math\.random|fake|synthetic/i);
});
