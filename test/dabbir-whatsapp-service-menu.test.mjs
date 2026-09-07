import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const menu=fs.readFileSync(new URL('../api/_dabbir-whatsapp-service-menu.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../api/dabbir-whatsapp-ai-worker.js',import.meta.url),'utf8');
const cron=fs.readFileSync(new URL('../api/dabbir-whatsapp-ai-cron.js',import.meta.url),'utf8');

test('WhatsApp service menu is built dynamically from tenant services, not hard-coded products',()=>{
  assert.match(menu,/context\?\.services/);
  assert.match(menu,/serviceName\(s\)/);
  assert.match(menu,/service:\$\{s\.id\}/);
  assert.doesNotMatch(menu,/تنظيف منزل|غسيل سجاد/);
});

test('service discovery uses a clickable WhatsApp interactive list',()=>{
  assert.match(menu,/type:'interactive'/);
  assert.match(menu,/interactive:\{type:'list'/);
  assert.match(menu,/اضغط لعرض المدة والسعر/);
  assert.match(menu,/View services/);
});

test('selecting a service returns verified duration and price then asks for time',()=>{
  assert.match(menu,/duration_minutes/);
  assert.match(menu,/price/);
  assert.match(menu,/المدة:/);
  assert.match(menu,/السعر:/);
  assert.match(menu,/متى يناسبك الموعد/);
  assert.match(menu,/pending_action==='service_selected'/);
});

test('service booking time is handled deterministically before generic planner fallback',()=>{
  assert.match(menu,/resolveRequestedLocal/);
  assert.match(menu,/dabbir_whatsapp_ai_check_availability/);
  assert.match(menu,/setState\(context,'choose_slot'/);
  const menuPos=menu.indexOf('tryServiceFlow(claim)');
  const fallbackPos=menu.lastIndexOf('processClaimedWhatsAppAiBatch(claim)');
  assert.ok(menuPos>=0&&fallbackPos>menuPos);
});

test('live worker and recovery cron both route through service-menu guard',()=>{
  assert.match(worker,/processWhatsAppDispatchWithServiceMenu/);
  assert.doesNotMatch(worker,/processWhatsAppAiDispatchToken/);
  assert.match(cron,/processWhatsAppRecoveryWithServiceMenu/);
  assert.doesNotMatch(cron,/processWhatsAppAiRecovery/);
});

test('service menu outbound resolves the exact conversation branch connection',()=>{
  assert.match(menu,/loadConversationConnectionWithServiceKey/);
  assert.match(menu,/context\.conversation\.id/);
  assert.doesNotMatch(menu,/loadBusinessConnectionWithServiceKey/);
});
