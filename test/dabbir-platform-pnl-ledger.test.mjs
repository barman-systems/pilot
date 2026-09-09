import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260909051108_platform_pnl_ledger_v1.sql',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../api/owner-finance.js',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../api/_platform-finance.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../api/platform-pnl-ui.js',import.meta.url),'utf8');
const billingUi=fs.readFileSync(new URL('../api/dabbir-billing-ui.js',import.meta.url),'utf8');
const platformCustomersUi=fs.readFileSync(new URL('../api/platform-customers-ui.js',import.meta.url),'utf8');
const bundles=fs.readFileSync(new URL('../config/dabbir-ui-bundles.json',import.meta.url),'utf8');

test('canonical P&L ledger is DABBIR-only and append-only for service role',()=>{
  assert.match(sql,/dabbir_private\.platform_finance_events/);
  assert.match(sql,/DABBIR_PLATFORM_ONLY/);
  assert.doesNotMatch(sql,/dabbir_operational_payments|payer_customer_id|recipient_business_id|gross_amount_minor/);
  assert.match(sql,/revoke all on dabbir_private\.platform_finance_events from public, anon, authenticated/i);
  assert.match(sql,/revoke update, delete, truncate on dabbir_private\.platform_finance_events from service_role/i);
  assert.match(sql,/grant select, insert on dabbir_private\.platform_finance_events to service_role/i);
});

test('financial events are idempotent and conflicts fail closed',()=>{
  assert.match(sql,/source_event_key text not null unique/i);
  assert.match(sql,/DABBIR_FINANCE_EVENT_CONFLICT/);
  assert.match(sql,/DABBIR_FINANCE_AMOUNT_INVALID/);
  assert.match(sql,/DABBIR_FINANCE_BUSINESS_NOT_FOUND/);
  assert.match(client,/dabbir_platform_finance_record_event_v1/);
});

test('P&L never invents a final profit while required sources are missing',()=>{
  assert.match(sql,/measurement_state.*COMPLETE.*PARTIAL/s);
  assert.match(sql,/net_profit_aed.*case when v_complete/s);
  assert.match(sql,/unpriced_ai_operations/);
  assert.match(sql,/pending_ai_reconciliations/);
  assert.match(sql,/missing_sources/);
  assert.match(sql,/LIVE_REVENUE_NOT_CAPTURED/);
});

test('solo-owner labor is explicitly excluded instead of inventing payroll',()=>{
  assert.match(sql,/owner_labor_state','EXCLUDED_SOLO_OWNER'/);
  assert.match(ui,/Employee cost: 0/);
  assert.match(ui,/تكلفة الموظفين: 0/);
});

test('owner P&L API is root-owner gated and month-scoped',()=>{
  assert.match(api,/authority_role\?\.!=='ROOT_OWNER'|authority_role!==['"]ROOT_OWNER['"]/);
  assert.match(api,/ownerSessionToken/);
  assert.match(api,/platformPnlMonth/);
  assert.match(api,/INVALID_MONTH/);
});

test('P&L capability probe is quiet while real financial data remains fail-closed',()=>{
  assert.match(api,/action==='capability'/);
  assert.match(api,/quietCapability\(res,\{reason:'OWNER_SESSION_REQUIRED'\}\)/);
  assert.match(api,/quietCapability\(res,\{authenticated:true,reason:'ROOT_OWNER_REQUIRED'\}\)/);
  assert.match(api,/return json\(res,401,\{ok:false,error:'OWNER_SESSION_REQUIRED'\}\)/);
  assert.match(api,/ROOT_OWNER_REQUIRED/);
  assert.match(ui,/\/api\/owner-finance\?action=capability/);
  assert.match(ui,/capabilityChecked/);
  assert.match(ui,/capabilityAllowed/);
  assert.match(ui,/response\.status===401\|\|response\.status===403/);
  const capabilityIndex=ui.indexOf('/api/owner-finance?action=capability');
  const dataIndex=ui.indexOf('/api/owner-finance?month=');
  assert.ok(capabilityIndex>=0&&dataIndex>capabilityIndex,'capability probe must precede the protected P&L data fetch');
});

test('owner UI shows known result, final net profit and source gaps separately',()=>{
  assert.match(ui,/known_operating_result_aed/);
  assert.match(ui,/net_profit_aed/);
  assert.match(ui,/missing_sources/);
  assert.match(ui,/allocated_shared_cost_aed/);
  assert.match(ui,/known_contribution_aed/);
  assert.match(ui,/export const platformPnlScript/);
  assert.match(billingUi,/platformPnlScript/);
  assert.match(billingUi,/\.\/platform-pnl-ui\.js/);
  assert.match(bundles,/\/api\/dabbir-billing-ui/);
  assert.doesNotMatch(bundles,/\/api\/platform-pnl-ui/);
});

test('root P&L stays inert in a normal tenant owner shell',()=>{
  assert.match(ui,/querySelector\('#screen-platform-customers'\)/);
  assert.doesNotMatch(ui,/querySelector\('#home'\)/);
  assert.match(platformCustomersUi,/enabled\s*=\s*true;\s*ensureScreen\(\)/s);
  assert.match(platformCustomersUi,/action=capability/);
  assert.match(ui,/if\(!capabilityChecked\|\|denied\)\{el\.hidden=true;return\}/);
  assert.match(ui,/!data&&!loading&&!denied&&!capabilityPromise/);
});
