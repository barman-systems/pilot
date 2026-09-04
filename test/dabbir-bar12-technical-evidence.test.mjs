import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mergeTechnicalEvidence } from '../.github/scripts/dabbir-bar12-technical-evidence.mjs';

const SHA='e5da322e56fc4903b5ee937e8a49686dc2d1de07';
const DEPLOY='dpl_A6cqCH6bW9ch9iDgye2FpKGCeEnQ';
const NOW=Date.parse('2026-09-02T12:50:00.000Z');
const base={expected_main_sha:SHA,production_deployment:{id:DEPLOY,state:'READY',source_commit:SHA},monitoring:{runtime_errors_checked:false,alert_delivery_verified:false},critical_gates:{security:null,financial:null,legal:null}};
const review={schema_version:'dabbir_bar12_technical_review_v1',runtime_monitoring:{source_commit:SHA,deployment_id:DEPLOY,origin:'https://dabbir.bmalman.com',checked_at:'2026-09-02T12:38:19.980Z',window_hours:24,provider:'Vercel Runtime Logs',levels_checked:['warning','error','fatal'],matching_logs:0},alert_delivery:{source_commit:SHA,deployment_id:DEPLOY,origin:'https://dabbir.bmalman.com',verified_at:'2026-09-02T12:49:28.186Z',provider:'Slack',delivery_mode:'BARMAN_EXECUTIVE_OS_TO_SLACK_OWNER_ALERT_CHANNEL',channel_id:'C0BRQQER3UH',channel_name:'barman-executive-alerts',message_ts:'1788353368.186149',message_link:'https://barman-global.slack.com/archives/C0BRQQER3UH/p1788353368186149',readback_verified:true,test_only:true,contains_secrets_or_customer_data:false},security:{source_commit:SHA,project_ref:'fphpoysqdsceniwduxjq',reviewed_at:'2026-09-02T12:38:59.130Z',verdict:'PASS',blocking_findings:0,advisor_max_level:'INFO',reviewed_warnings:[],reviewed_functions:['public.dabbir_public_car_wash_book','public.dabbir_public_car_wash_catalog','public.dabbir_public_car_wash_slots','public.dabbir_public_order_status','public.dabbir_claim_ai_budget_v1','public.dabbir_finalize_ai_budget_v1'],review_basis:{security_advisor_rerun:true,public_definer_functions_reviewed:true,anonymous_direct_table_dml_for_booking_requests:false,booking_abuse_guard_trigger_present:true,public_catalog_is_bounded:true,public_slots_are_bounded:true,public_order_status_uses_unguessable_uuid_token:true}}};

test('exact fresh technical evidence promotes runtime monitoring, owner alert delivery and security only',()=>{
  const {evidence,report}=mergeTechnicalEvidence(base,review,{now:NOW});
  assert.equal(report.runtime_monitoring.valid,true);
  assert.equal(report.alert_delivery.valid,true);
  assert.equal(report.critical_security.valid,true);
  assert.equal(evidence.monitoring.runtime_errors_checked,true);
  assert.equal(evidence.monitoring.runtime_errors.matching_logs,0);
  assert.equal(evidence.monitoring.alert_delivery_verified,true);
  assert.equal(evidence.monitoring.alert_delivery.channel_id,'C0BRQQER3UH');
  assert.equal(evidence.monitoring.alert_delivery.message_ts,'1788353368.186149');
  assert.equal(evidence.critical_gates.security,'PASS');
  assert.equal(evidence.critical_gates.financial,null);
  assert.equal(evidence.critical_gates.legal,null);
});

test('stale technical review fails closed for monitoring, alerting and security',()=>{
  const {evidence,report}=mergeTechnicalEvidence(base,review,{now:Date.parse('2026-09-04T12:50:00.000Z')});
  assert.equal(report.runtime_monitoring.valid,false);
  assert.equal(report.alert_delivery.valid,false);
  assert.equal(report.critical_security.valid,false);
  assert.equal(evidence.monitoring.runtime_errors_checked,false);
  assert.equal(evidence.monitoring.alert_delivery_verified,false);
  assert.equal(evidence.critical_gates.security,null);
});

test('wrong release identity cannot inherit a prior technical or alert PASS',()=>{
  const wrong={...base,expected_main_sha:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',production_deployment:{...base.production_deployment,id:'dpl_other',source_commit:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'}};
  const {evidence}=mergeTechnicalEvidence(wrong,review,{now:NOW});
  assert.equal(evidence.monitoring.runtime_errors_checked,false);
  assert.equal(evidence.monitoring.alert_delivery_verified,false);
  assert.equal(evidence.critical_gates.security,null);
});

test('alert PASS requires the reserved Slack channel, readback, safe payload and a real message identity',()=>{
  for(const mutate of [
    x=>{x.alert_delivery.channel_id='C_OTHER'},
    x=>{x.alert_delivery.readback_verified=false},
    x=>{x.alert_delivery.contains_secrets_or_customer_data=true},
    x=>{x.alert_delivery.message_ts='not-a-message'},
    x=>{x.alert_delivery.message_link='https://example.com/fake'},
  ]){
    const unsafe=structuredClone(review); mutate(unsafe);
    const {evidence,report}=mergeTechnicalEvidence(base,unsafe,{now:NOW});
    assert.equal(report.alert_delivery.valid,false);
    assert.equal(evidence.monitoring.alert_delivery_verified,false);
  }
});

test('security PASS requires all reviewed public-definer functions and safety assertions',()=>{
  const unsafe=structuredClone(review);
  unsafe.security.review_basis.booking_abuse_guard_trigger_present=false;
  unsafe.security.reviewed_functions.shift();
  const {evidence}=mergeTechnicalEvidence(base,unsafe,{now:NOW});
  assert.equal(evidence.critical_gates.security,null);
});

test('security PASS rejects an advisor ERROR while accepting a clean INFO-only result',()=>{
  const clean=mergeTechnicalEvidence(base,review,{now:NOW});
  assert.equal(clean.evidence.critical_gates.security,'PASS');
  const unsafe=structuredClone(review);
  unsafe.security.advisor_max_level='ERROR';
  const {evidence}=mergeTechnicalEvidence(base,unsafe,{now:NOW});
  assert.equal(evidence.critical_gates.security,null);
});

test('BAR-12 workflow imports technical evidence before evaluation and keeps external WhatsApp/financial/legal fail closed',()=>{
  const workflow=fs.readFileSync(new URL('../.github/workflows/dabbir-bar12-readiness.yml',import.meta.url),'utf8');
  const journeyWorkflow=fs.readFileSync(new URL('../.github/workflows/dabbir-ai-customer-journey.yml',import.meta.url),'utf8');
  const mergeAt=workflow.indexOf('Merge verified technical readiness evidence');
  const evaluateAt=workflow.indexOf('Evaluate BAR-12 readiness');
  assert.ok(mergeAt>0&&evaluateAt>mergeAt);
  assert.match(workflow,/\.github\/scripts\/dabbir-bar12-technical-evidence\.mjs/);
  assert.match(workflow,/docs\/evidence\/dabbir-bar12-technical-review\.json/);
  assert.match(workflow,/real_external_connection:false/);
  assert.match(workflow,/financial:null/);
  assert.match(workflow,/legal:null/);
  assert.match(journeyWorkflow,/- '\.github\/scripts\/dabbir-bar12-\*'/);
  assert.match(journeyWorkflow,/- 'test\/dabbir-bar12-\*'/);
});
