import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const cron=fs.readFileSync(new URL('../api/dabbir-ai-billing-reconcile-cron.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260907135618_dabbir_ai_gateway_billing_reconciliation_v1.sql',import.meta.url),'utf8');
const vercel=fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8');

test('Gateway reconciliation reads actual billing reports by WhatsApp business and model',()=>{assert.match(cron,/getVercelOidcToken/);assert.match(cron,/group_by:'user'/);assert.match(cron,/group_by:'model'/);assert.match(cron,/user_id:businessId/);assert.match(cron,/tags:'channel:whatsapp'/);assert.match(cron,/total_cost/);assert.match(cron,/dabbir_reconcile_ai_gateway_cost_v1/)});
test('authoritative paid fallback cost remains in the existing operation ledger',()=>{assert.match(migration,/insert into public\.dabbir_operation_outcomes/i);assert.match(migration,/ai_gateway_billing_reconciliation/);assert.match(migration,/VERCEL_AI_GATEWAY_REPORT/);assert.match(migration,/dabbir_ai_customer_cost_monthly_v1/);assert.match(migration,/cost_authority/);assert.match(migration,/PENDING_GATEWAY_RECONCILIATION/)});
test('billing reconciliation is a protected bounded cron with a controlled current-day proof window',()=>{const cfg=JSON.parse(vercel);assert.ok(cfg.crons.some(item=>item.path==='/api/dabbir-ai-billing-reconcile-cron'&&item.schedule==='*/5 * * * *'));assert.equal(cfg.functions['api/dabbir-ai-billing-reconcile-cron.js'].maxDuration,60);assert.match(cron,/CRON_SECRET/);assert.match(cron,/slice\(0,500\)/);assert.match(cron,/SETTLEMENT_LAG_DAYS=0/);assert.match(cron,/RECONCILE_DAYS=1/);assert.match(cron,/settlement_lag_days:SETTLEMENT_LAG_DAYS/)});
