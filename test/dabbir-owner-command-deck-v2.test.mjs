import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderOwnerCommandCenter } from '../api/owner-command-center.js';

const ui=fs.readFileSync(new URL('../api/owner-command-center.js',import.meta.url),'utf8');

test('owner overview exposes the executive command deck without adding another data call',()=>{
  const html=renderOwnerCommandCenter({authority_role:'ROOT_OWNER',permissions:[],granular_permissions:[]},'ar');
  for(const id of ['executiveDeckPanel','activationMilestones','customerHealthPanel','reliabilityPanel','reliabilityTruth'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(ui,/const results=await Promise\.allSettled\(\[api\(dataUrl\('overview'\)\),root\?api\(dataUrl\('executive'\)\)/);
  assert.match(ui,/function renderExecutiveDeck\(\)/);
  assert.match(ui,/e\.funnel\|\|\{\}/);
  assert.match(ui,/e\.customer_health\|\|\{\}/);
  assert.match(ui,/e\.risk_register\|\|\{\}/);
  assert.match(ui,/e\.reliability\|\|\{\}/);
});

test('activation milestones are explicitly not presented as a linear funnel',()=>{
  assert.match(ui,/مؤشرات تفعيل مستقلة وليست Funnel خطيًا/);
  assert.match(ui,/independent activation milestones, not a strict linear funnel/);
  for(const field of ['signup_accounts','created_business','catalog_ready','first_value','whatsapp_connected','subscribed'])assert.match(ui,new RegExp(`f\\.${field}`));
});

test('reliability remains fail-closed when telemetry is missing',()=>{
  assert.match(ui,/runtimeState==='NEEDS_INSTRUMENTATION'/);
  assert.match(ui,/غياب القياس لا يُعرض كصفر أو كحالة سليمة/);
  assert.match(ui,/Missing telemetry is not shown as zero or healthy/);
  assert.match(ui,/telemetry_gaps/);
  assert.doesNotMatch(ui,/runtime_5xx_24h\s*\|\|\s*0/);
});

test('root executive health is surfaced as actionable attention',()=>{
  assert.match(ui,/أنشطة حمراء تحتاج تدخلاً/);
  assert.match(ui,/فجوات قياس مفتوحة/);
  assert.match(ui,/عمليات AI غير مسعّرة/);
  assert.match(ui,/riskReason/);
});

test('HTML escaping keeps complete entities',()=>{
  assert.match(ui,/['"]&quot;['"]/);
});
