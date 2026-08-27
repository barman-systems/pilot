import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCashGuardian, cashGuardianActionCenterItem } from '../api/_cash-guardian.js';
import { augmentWithCashGuardian } from '../api/owner-action-center-away.js';
import { applyOwnerAwayEscalation } from '../api/_owner-away-policy.js';

const nowMs=Date.parse('2026-08-27T12:00:00.000Z');
const iso=offsetMs=>new Date(nowMs+offsetMs).toISOString();
const day=24*60*60*1000;

function coverage(){
  return [
    {scope:'inflows',coverage_level:'complete',coverage_start:iso(-day),coverage_end:iso(20*day),source_system:'qa-ledger',source_observed_at:iso(-60*60*1000)},
    {scope:'outflows',coverage_level:'complete',coverage_start:iso(-day),coverage_end:iso(20*day),source_system:'qa-ledger',source_observed_at:iso(-60*60*1000)},
  ];
}

function evidenceBase(overrides={}){
  return {
    id:crypto.randomUUID(),
    evidence_type:'cash_balance',
    amount_aed:1000,
    effective_at:iso(-60*60*1000),
    due_at:null,
    source_kind:'integration',
    source_system:'qa-ledger',
    source_record_id:'account:1',
    source_event_id:crypto.randomUUID(),
    source_observed_at:iso(-60*60*1000),
    ...overrides,
  };
}

test('missing financial data is DATA_INSUFFICIENT and never becomes a fake forecast',()=>{
  const snapshot=evaluateCashGuardian({nowMs});
  assert.equal(snapshot.status,'DATA_INSUFFICIENT');
  assert.equal(snapshot.sufficient_data,false);
  assert.equal(snapshot.liquidity_range,null);
  assert.deepEqual(snapshot.insufficiency_reasons,['BALANCE_MISSING','INFLOW_COVERAGE_INCOMPLETE','OUTFLOW_COVERAGE_INCOMPLETE']);
  assert.equal(snapshot.truth.unverified_forecast_blocked,true);
  assert.equal(snapshot.truth.range_not_point_forecast,true);
});

test('orders are not treated as cash receipts',()=>{
  const snapshot=evaluateCashGuardian({
    nowMs,
    orders:[{status:'confirmed',simulated:false,total_aed:999999}],
  });
  assert.equal(snapshot.status,'DATA_INSUFFICIENT');
  assert.equal(snapshot.liquidity_range,null);
  assert.equal(snapshot.truth.orders_are_not_cash_receipts,true);
  assert.equal(snapshot.truth.simulated_orders_ignored,true);
});

test('a fresh balance without complete inflow/outflow coverage remains insufficient',()=>{
  const snapshot=evaluateCashGuardian({evidence:[evidenceBase()],coverage:[],nowMs});
  assert.equal(snapshot.status,'DATA_INSUFFICIENT');
  assert.equal(snapshot.coverage.balance.status,'FRESH');
  assert.ok(snapshot.insufficiency_reasons.includes('INFLOW_COVERAGE_INCOMPLETE'));
  assert.ok(snapshot.insufficiency_reasons.includes('OUTFLOW_COVERAGE_INCOMPLETE'));
  assert.equal(snapshot.liquidity_range,null);
});

test('verified commitments and receivables create an honest liquidity range',()=>{
  const evidence=[
    evidenceBase({amount_aed:1000}),
    evidenceBase({evidence_type:'payable_due',amount_aed:1200,due_at:iso(day),source_record_id:'bill:1',source_event_id:'bill:1:due'}),
    evidenceBase({evidence_type:'receivable_due',amount_aed:500,due_at:iso(2*day),source_record_id:'invoice:1',source_event_id:'invoice:1:due'}),
  ];
  const snapshot=evaluateCashGuardian({evidence,coverage:coverage(),nowMs});
  assert.equal(snapshot.status,'RISK');
  assert.equal(snapshot.sufficient_data,true);
  assert.deepEqual(snapshot.liquidity_range,{
    horizon_days:14,
    horizon_end:iso(14*day),
    current_balance_aed:1000,
    committed_outflows_aed:1200,
    verified_receivables_aed:500,
    lower_bound_aed:-200,
    upper_bound_aed:300,
    owner_buffer_threshold_aed:null,
    hard_floor_aed:0,
    meaning:'LOWER_EXCLUDES_RECEIVABLES_UPPER_ASSUMES_ALL_VERIFIED_RECEIVABLES_ARRIVE',
  });
  assert.equal(snapshot.traceability.payables[0].source_record_id,'bill:1');
  assert.equal(snapshot.traceability.receivables[0].source_record_id,'invoice:1');
});

test('settlement evidence reduces the open obligation instead of double counting it',()=>{
  const evidence=[
    evidenceBase({amount_aed:1000}),
    evidenceBase({evidence_type:'payable_due',amount_aed:1200,due_at:iso(day),source_record_id:'bill:2',source_event_id:'bill:2:due'}),
    evidenceBase({evidence_type:'payable_settled',amount_aed:700,effective_at:iso(-day),source_record_id:'bill:2',source_event_id:'bill:2:payment:1'}),
  ];
  const snapshot=evaluateCashGuardian({evidence,coverage:coverage(),nowMs});
  assert.equal(snapshot.status,'CLEAR');
  assert.equal(snapshot.liquidity_range.committed_outflows_aed,500);
  assert.equal(snapshot.liquidity_range.lower_bound_aed,500);
  assert.equal(snapshot.traceability.payables[0].amount_aed,500);
});

test('upper bound below zero is a critical owner-gated exception',()=>{
  const evidence=[
    evidenceBase({amount_aed:500}),
    evidenceBase({evidence_type:'payable_due',amount_aed:1000,due_at:iso(day),source_record_id:'bill:3',source_event_id:'bill:3:due'}),
    evidenceBase({evidence_type:'receivable_due',amount_aed:200,due_at:iso(day),source_record_id:'invoice:3',source_event_id:'invoice:3:due'}),
  ];
  const snapshot=evaluateCashGuardian({evidence,coverage:coverage(),nowMs});
  assert.equal(snapshot.status,'CRITICAL');
  assert.equal(snapshot.liquidity_range.upper_bound_aed,-300);
  const item=cashGuardianActionCenterItem(snapshot);
  assert.equal(item.owner_gate,true);
  assert.equal(item.severity,'critical');
  const away=applyOwnerAwayEscalation([item],{active:true});
  assert.equal(away.visible.length,1);
  assert.equal(away.deferred.length,0);
});

test('stale balance blocks liquidity claims even when due-item coverage is complete',()=>{
  const stale=evidenceBase({effective_at:iso(-4*day),source_observed_at:iso(-4*day)});
  const snapshot=evaluateCashGuardian({evidence:[stale],coverage:coverage(),nowMs});
  assert.equal(snapshot.status,'DATA_INSUFFICIENT');
  assert.ok(snapshot.insufficiency_reasons.includes('BALANCE_STALE'));
  assert.equal(snapshot.liquidity_range,null);
});

test('overdue verified receivable exposes only internal non-financial follow-up eligibility',()=>{
  const evidence=[
    evidenceBase(),
    evidenceBase({
      evidence_type:'receivable_due',amount_aed:250,due_at:iso(-day),source_record_id:'invoice:late',source_event_id:'invoice:late:due',
      customer_id:'00000000-0000-4000-8000-000000000001',conversation_id:'00000000-0000-4000-8000-000000000002',
    }),
  ];
  const snapshot=evaluateCashGuardian({evidence,coverage:coverage(),nowMs});
  assert.equal(snapshot.overdue_receivables.count,1);
  assert.equal(snapshot.overdue_receivables.amount_aed,250);
  assert.equal(snapshot.overdue_receivables.auto_internal_followup_eligible,1);
  const action=snapshot.actions.find(row=>row.key==='FOLLOW_UP_OVERDUE_RECEIVABLES');
  assert.equal(action.external_side_effects,false);
  assert.equal(action.financial_side_effects,false);
  assert.equal(snapshot.truth.money_movement_capability,false);
  assert.equal(snapshot.truth.payment_execution_capability,false);
});

test('Cash Guardian augments only the top owner exceptions and preserves no-money truth',()=>{
  const payload={
    ok:true,
    status:'watch',
    metrics:{urgent:0,warning:1,total:1},
    brief:{ar:'عنصر تشغيلي.',en:'Operational item.'},
    items:[{id:'x',type:'order',priority:50,severity:'warning',title_ar:'طلب',title_en:'Order'}],
    truth:{source:'real'},
  };
  const snapshot=evaluateCashGuardian({
    evidence:[
      evidenceBase({amount_aed:100}),
      evidenceBase({evidence_type:'payable_due',amount_aed:300,due_at:iso(day),source_record_id:'bill:4',source_event_id:'bill:4:due'}),
    ],
    coverage:coverage(),
    nowMs,
  });
  const next=augmentWithCashGuardian(payload,snapshot);
  assert.equal(next.items[0].type,'cash_guardian');
  assert.equal(next.items[0].owner_gate,true);
  assert.equal(next.truth.cash_guardian_money_movement,false);
  assert.match(next.brief.ar,/حارس السيولة/);
});

test('database contract is append-only for owner evidence and cron never sends or moves money',()=>{
  const migration=fs.readFileSync('supabase/migrations/20260827131000_dabbir_cash_guardian_v1.sql','utf8');
  assert.match(migration,/alter table public\.dabbir_financial_evidence force row level security/i);
  assert.match(migration,/grant select, insert on public\.dabbir_financial_evidence to authenticated/i);
  assert.doesNotMatch(migration,/grant[^;]*(update|delete)[^;]*dabbir_financial_evidence[^;]*authenticated/i);
  assert.match(migration,/source_kind='owner_attested'/);
  assert.match(migration,/cash_guardian\.capture_internal_followup/);
  assert.match(migration,/cron\.schedule\(/);
  assert.match(migration,/external_side_effects',false/);
  assert.match(migration,/money_movement',false/);
  assert.doesNotMatch(migration,/net\.http_(post|get)|stripe|payment_intent|bank_transfer|withdraw/i);
});

test('Cash Guardian API is owner-only and same-origin for settings mutations',()=>{
  const source=fs.readFileSync('api/cash-guardian.js','utf8');
  assert.match(source,/membership\.role!=='owner'/);
  assert.match(source,/requireSameOrigin\(req\)/);
  assert.match(source,/buffer_threshold_aed/);
  assert.match(source,/horizon_days/);
  assert.doesNotMatch(source,/service_role|SUPABASE_SERVICE/i);
});
