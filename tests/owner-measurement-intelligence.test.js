import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveMeasurementWindow } from '../api/owner-measurement-data.js';

const text=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('measurement periods use Asia/Dubai boundaries without guessing browser timezone',()=>{
  const clock=new Date('2026-09-10T10:07:00.000Z');
  assert.deepEqual(resolveMeasurementWindow({period:'today'},clock),{
    period:'today',start:'2026-09-09T20:00:00.000Z',end:'2026-09-10T10:07:00.000Z',timezone:'Asia/Dubai',
  });
  assert.equal(resolveMeasurementWindow({period:'current_month'},clock).start,'2026-08-31T20:00:00.000Z');
  const previous=resolveMeasurementWindow({period:'previous_month'},clock);
  assert.equal(previous.start,'2026-07-31T20:00:00.000Z');
  assert.equal(previous.end,'2026-08-31T20:00:00.000Z');
  assert.throws(()=>resolveMeasurementWindow({period:'custom',start:'bad',end:'also-bad'},clock),/INVALID_CUSTOM_PERIOD/);
});

test('canonical AI usage attribution is tenant validated and service-role only',async()=>{
  const sql=await text('supabase/migrations/20260910102000_dabbir_metrics_attribution_v1.sql');
  assert.match(sql,/add column if not exists conversation_id uuid/i);
  assert.match(sql,/AI_USAGE_CONVERSATION_SCOPE_INVALID/);
  assert.match(sql,/AI_USAGE_CUSTOMER_SCOPE_INVALID/);
  assert.match(sql,/AI_USAGE_BRANCH_SCOPE_INVALID/);
  assert.match(sql,/security definer/i);
  assert.match(sql,/set search_path=''/i);
  assert.match(sql,/revoke all on function public\.dabbir_record_ai_usage_v2[\s\S]*from public,anon,authenticated/i);
  assert.match(sql,/grant execute[\s\S]*to service_role/i);
});

test('owner measurement preserves unknown and partial semantics',async()=>{
  const snapshot=await text('supabase/migrations/20260910110000_dabbir_owner_measurement_snapshot_v1.sql');
  const quality=await text('supabase/migrations/20260910104000_dabbir_owner_quality_measurement_v1.sql');
  const funnel=await text('supabase/migrations/20260910105000_dabbir_owner_funnel_measurement_v1.sql');
  assert.match(snapshot,/UNKNOWN\/PARTIAL\/NOT_MEASURED are preserved/);
  assert.match(snapshot,/REVENUE_NOT_AVAILABLE/);
  assert.match(snapshot,/INSUFFICIENT_SAMPLE/);
  assert.match(snapshot,/human-required conversations \/ conversations \* 100/);
  assert.match(quality,/stale_context_failure_count[\s\S]*NOT_MEASURED/);
  assert.match(quality,/abandoned_conversation_count[\s\S]*NOT_MEASURED/);
  assert.match(quality,/first_contact_resolution[\s\S]*NOT_MEASURED/);
  assert.match(funnel,/OFFERED[\s\S]*NOT_MEASURED/);
  assert.match(funnel,/REMINDED[\s\S]*NOT_MEASURED/);
});

test('owner metrics are aggregated server-side with scoped filters',async()=>{
  const usage=await text('supabase/migrations/20260910103000_dabbir_owner_usage_measurement_v1.sql');
  const options=await text('supabase/migrations/20260910111000_dabbir_owner_measurement_options_v1.sql');
  assert.match(usage,/p_business_id uuid default null/);
  assert.match(usage,/p_branch_id uuid default null/);
  assert.match(usage,/p_channel text default null/);
  assert.match(usage,/p_provider text default null/);
  assert.match(usage,/p_model text default null/);
  assert.match(usage,/dabbir_private\.owner_scope_businesses_v1/);
  assert.match(options,/join dabbir_private\.owner_scope_businesses_v1\(p_scope\)/);
  assert.match(options,/revoke all on function public\.dabbir_owner_measurement_options_v1\(jsonb\) from public,anon,authenticated/);
});

test('WhatsApp AI meter writes canonical conversation attribution without blocking replies on meter failure',async()=>{
  const source=await text('api/_dabbir-whatsapp-ai-meter.js');
  assert.match(source,/rpc\/dabbir_record_ai_usage_v2/);
  assert.match(source,/p_conversation_id:conversationId\|\|null/);
  assert.match(source,/\.catch\(error=>\{\s*console\.warn\('dabbir_whatsapp_ai_meter_failed'/);
  assert.doesNotMatch(source,/throw error;\s*\/\/.*meter/i);
});

test('owner measurement dashboard is the landing route and old operations remain reachable',async()=>{
  const vercel=JSON.parse(await text('vercel.json'));
  const bySource=new Map(vercel.rewrites.map(x=>[x.source,x.destination]));
  assert.equal(bySource.get('/owner-dashboard'),'/api/owner-measurement-center');
  assert.equal(bySource.get('/owner-dashboard/measurement'),'/api/owner-measurement-center');
  assert.equal(bySource.get('/owner-dashboard/operations'),'/api/owner-dashboard-gateway');
});

test('measurement UI supports RTL, English, iPhone and iPad responsive layouts',async()=>{
  const ui=await text('api/owner-measurement-center.js');
  assert.match(ui,/dir=\\"\$\{dir\}\\"/);
  assert.match(ui,/lang=en/);
  assert.match(ui,/@media\(max-width:390px\)/);
  assert.match(ui,/@media\(min-width:768px\) and \(max-width:1024px\)/);
  assert.match(ui,/PARTIAL \/ UNKNOWN \/ NOT MEASURED/);
  assert.match(ui,/owner-dashboard\/operations/);
});
