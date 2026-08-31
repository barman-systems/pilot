import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

const manifest=JSON.parse(read('config/dabbir-ui-bundles.json'));
const ui=read('api/dabbir-activity-experience-ui.js');
const router=read('api/dabbir-contextual-navigation-ui.js');
const api=read('api/activity-workflow.js');
const publicStatusApi=read('api/public-order-status.js');
const migration=read('supabase/migrations/20260831110000_dabbir_activity_workflows_v1.sql');
const status=read('status.html');
const recovery=read('api/app-recovery.js');

test('activity experience is deferred and cache version is bumped',()=>{
  assert.ok(manifest.deferred.includes('/api/dabbir-activity-experience-ui'));
  assert.equal(manifest.critical.length,3);
  assert.equal(manifest.critical.at(-1),'/api/auth-session-stability-ui');
  assert.match(recovery,/20260831-activity-experience-v1/);
  assert.match(recovery,/\/api\/dabbir-activity-experience-ui/);
});

test('onboarding covers laundry and contextual small-business labels without growing critical bundle',()=>{
  assert.match(recovery,/laundry:'مغسلة'/);
  assert.match(recovery,/بيع عبر Instagram \/ WhatsApp/);
  assert.match(recovery,/صالون \/ مركز تجميل/);
  assert.match(recovery,/خدمات \/ ورشة \/ مشروع منزلي/);
  assert.match(recovery,/option\.value='laundry'/);
});

test('order-centric activities use distinct workflow templates and one navigation authority',()=>{
  assert.match(ui,/creator:\{/);
  assert.match(ui,/\['new','جديد'\],\['confirmed','مؤكد'\],\['preparing','قيد التجهيز'\],\['ready','جاهز'\],\['delivered','تم التسليم'\]/);
  assert.match(ui,/\['received','تم الاستلام'\],\['washing','قيد الغسيل'\],\['ready','جاهز'\],\['delivered','تم التسليم'\]/);
  assert.match(ui,/\['new','جديد'\],\['in_progress','تحت العمل'\],\['ready','جاهز'\],\['completed','مكتمل'\]/);
  assert.match(router,/isOrderBusiness/);
  assert.match(router,/setActivitySlot\(node,'workflow'/);
  assert.doesNotMatch(ui,/\.dataset\.screen\s*=/);
  assert.doesNotMatch(ui,/function\s+adaptActivitySlot/);
});

test('workflow progress is separated from financial order status',()=>{
  assert.match(migration,/add column if not exists workflow_status text not null default 'new'/);
  assert.match(api,/workflow_status:workflowStatus/);
  const updateBlock=api.slice(api.indexOf('async function updateWorkflow'),api.indexOf('export default async function handler'));
  assert.match(updateBlock,/workflow_status:workflowStatus/);
  assert.doesNotMatch(updateBlock,/[{,]\s*status\s*:\s*workflowStatus/);
});

test('public status link is unguessable, same-origin, and privacy minimized',()=>{
  assert.match(migration,/public_status_token uuid not null default gen_random_uuid\(\)/);
  assert.match(migration,/revoke all on function public\.dabbir_public_order_status\(uuid\) from public/i);
  assert.match(migration,/revoke execute on function public\.dabbir_public_order_status\(uuid\) from authenticated, service_role/i);
  assert.match(migration,/grant execute on function public\.dabbir_public_order_status\(uuid\) to anon/i);
  assert.match(publicStatusApi,/dabbir_public_order_status/);
  assert.match(status,/fetch\('\/api\/public-order-status\?token='/);
  assert.doesNotMatch(status,/supabase\.co|sb_publishable_/i);
  assert.doesNotMatch(status,/customer_name/);
  assert.doesNotMatch(status,/phone/);
});
