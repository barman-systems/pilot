import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ui=read('api/owner-command-center.js');
const gateway=read('api/owner-dashboard-gateway.js');
const decisions=read('api/owner-decisions.js');
const action=read('api/owner-action-bridge.js');
const synthetic=read('api/owner-ops-synthetic-cron.js');
const recovery=read('api/owner-recovery-cron.js');
const vercel=read('vercel.json');
const migration=read('supabase/migrations/20260902120949_dabbir_owner_command_center_v28_core.sql');

test('one authoritative runtime dashboard replaces the version render chain',()=>{
 assert.match(gateway,/import dashboard from '.\/owner-command-center\.js'/);
 assert.doesNotMatch(ui,/owner-command-center-v2[2-7]\.js/);
 assert.match(ui,/x-dabbir-owner-command-center/);
});

test('mobile-first command center exposes all operational tabs',()=>{
 for(const token of ['القيادة','التنفيذ','العملاء','الدعم','النظام','الحوكمة','CEO Mission Control','Reliability Center','Incident Center'])assert.match(ui,new RegExp(token));
 assert.match(ui,/@media\(max-width:560px\)/);
 assert.match(ui,/font-size:16px/);
 assert.match(ui,/min-height:46px/);
});

test('mission control supports objective acceptance due priority guidance cancel resume and evidence',()=>{
 for(const token of ['commandObjective','commandAcceptance','commandDue','reprioritize','add_guidance','set_due_at','cancel','resume','timeline','evidence'])assert.match(ui,new RegExp(token));
});

test('owner decision inbox is an explicit approval surface',()=>{
 assert.match(ui,/قرارات تحتاج المالك/);
 for(const token of ['approve','reject','modify'])assert.match(ui,new RegExp(token));
 assert.match(decisions,/requireSameOrigin/);
 assert.match(decisions,/ownerBroker/);
});

test('audited executor is server-side and exposes only proven non-financial operations',()=>{
 for(const token of ['set_inventory','set_product_active','cancel_pending_order','set_service_active','support_create_case','support_add_note','support_set_status'])assert.match(action,new RegExp(token));
 assert.match(action,/SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(action,/ownerBroker/);
 assert.match(action,/dabbir_platform_owner_action_v1/);
 assert.match(action,/dabbir_platform_owner_audit_v1/);
 assert.doesNotMatch(ui,/SUPABASE_SERVICE_ROLE_KEY|service_role|apikey/i);
});

test('reliability instrumentation has synthetic sampling, percentiles and recovery verification',()=>{
 for(const token of ['uptime_pct_24h','api_p50_ms','api_p95_ms','api_p99_ms','db_p50_ms','db_p95_ms','db_p99_ms','runtime_5xx_24h','restore_test_last_at'])assert.match(migration,new RegExp(token));
 assert.match(synthetic,/dabbir_owner_ops_sample_write_v1/);
 assert.match(recovery,/dabbir_owner_recovery_maintenance_v1/);
 assert.match(vercel,/owner-ops-synthetic-cron/);
 assert.match(vercel,/owner-recovery-cron/);
});

test('customer health v2 is deterministic and command queue is private',()=>{
 assert.match(migration,/health-v2-deterministic/);
 assert.match(migration,/no_first_value/);
 assert.match(migration,/catalog_empty/);
 assert.match(migration,/dabbir_private\.dabbir_ceo_commands/);
});
