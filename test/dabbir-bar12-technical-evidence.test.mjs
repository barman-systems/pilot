import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mergeTechnicalEvidence } from '../.github/scripts/dabbir-bar12-technical-evidence.mjs';

const SHA='e5da322e56fc4903b5ee937e8a49686dc2d1de07';
const DEPLOY='dpl_A6cqCH6bW9ch9iDgye2FpKGCeEnQ';
const NOW=Date.parse('2026-09-02T12:50:00.000Z');
const VOICE_FUNCTIONS=[
  'public.dabbir_whatsapp_persist_voice_inbound',
  'public.dabbir_whatsapp_voice_claim_dispatch',
  'public.dabbir_whatsapp_voice_claim_next',
  'public.dabbir_whatsapp_voice_finalize',
  'public.dabbir_whatsapp_voice_complete_clarification',
  'public.dabbir_whatsapp_voice_fail',
];
const base={expected_main_sha:SHA,production_deployment:{id:DEPLOY,state:'READY',source_commit:SHA},monitoring:{runtime_errors_checked:false,alert_delivery_verified:false},critical_gates:{security:null,financial:null,legal:null},feature_gates:{voice_notes:null}};
const review={
  schema_version:'dabbir_bar12_technical_review_v2',
  runtime_monitoring:{source_commit:SHA,deployment_id:DEPLOY,origin:'https://dabbir.bmalman.com',checked_at:'2026-09-02T12:38:19.980Z',window_hours:24,provider:'Vercel Runtime Logs',levels_checked:['warning','error','fatal'],matching_logs:0},
  alert_delivery:{source_commit:SHA,deployment_id:DEPLOY,origin:'https://dabbir.bmalman.com',verified_at:'2026-09-02T12:49:28.186Z',provider:'Slack',delivery_mode:'BARMAN_EXECUTIVE_OS_TO_SLACK_OWNER_ALERT_CHANNEL',channel_id:'C0BRQQER3UH',channel_name:'barman-executive-alerts',message_ts:'1788353368.186149',message_link:'https://barman-global.slack.com/archives/C0BRQQER3UH/p1788353368186149',readback_verified:true,test_only:true,contains_secrets_or_customer_data:false},
  security:{source_commit:SHA,project_ref:'fphpoysqdsceniwduxjq',reviewed_at:'2026-09-02T12:38:59.130Z',verdict:'PASS',blocking_findings:0,advisor_max_level:'INFO',reviewed_warnings:[],reviewed_functions:['public.dabbir_public_car_wash_book','public.dabbir_public_car_wash_catalog','public.dabbir_public_car_wash_slots','public.dabbir_public_order_status','public.dabbir_claim_ai_budget_v1','public.dabbir_finalize_ai_budget_v1'],review_basis:{security_advisor_rerun:true,public_definer_functions_reviewed:true,anonymous_direct_table_dml_for_booking_requests:false,booking_abuse_guard_trigger_present:true,public_catalog_is_bounded:true,public_slots_are_bounded:true,public_order_status_uses_unguessable_uuid_token:true}},
  voice_notes:{
    source_commit:SHA,
    deployment_id:DEPLOY,
    origin:'https://dabbir.bmalman.com',
    provider:'Meta WhatsApp Cloud API',
    verified_at:'2026-09-02T12:45:00.000Z',
    real_external_inbound_verified:true,
    real_external_reply_or_action_verified:true,
    uncertain_voice_fail_closed_verified:true,
    signed_webhook_verified:true,
    provider_media_fetch_verified:true,
    transcript_pipeline_verified:true,
    tenant_isolation_verified:true,
    raw_audio_persisted:false,
    service_role_only_functions_verified:true,
    contains_secrets_or_customer_data:false,
    reviewed_functions:VOICE_FUNCTIONS,
    evidence_refs:{external_inbound:'voice-ingest:11111111-1111-4111-8111-111111111111',external_outcome:'voice-outcome:22222222-2222-4222-8222-222222222222',uncertain_clarification:'voice-clarification:33333333-3333-4333-8333-333333333333'},
  },
};

test('exact fresh technical evidence promotes runtime, alert, security and independently proven voice notes',()=>{
  const {evidence,report}=mergeTechnicalEvidence(base,review,{now:NOW});
  assert.equal(report.runtime_monitoring.valid,true);assert.equal(report.alert_delivery.valid,true);assert.equal(report.critical_security.valid,true);assert.equal(report.voice_notes.valid,true);
  assert.equal(evidence.monitoring.runtime_errors_checked,true);assert.equal(evidence.monitoring.runtime_errors.matching_logs,0);assert.equal(evidence.monitoring.alert_delivery_verified,true);
  assert.equal(evidence.critical_gates.security,'PASS');assert.equal(evidence.feature_gates.voice_notes,'PASS');assert.equal(evidence.critical_gates.financial,null);assert.equal(evidence.critical_gates.legal,null);
});

test('stale technical review fails closed for monitoring, alerting, security and voice notes',()=>{
  const {evidence,report}=mergeTechnicalEvidence(base,review,{now:Date.parse('2026-09-04T12:50:00.000Z')});
  assert.equal(report.runtime_monitoring.valid,false);assert.equal(report.alert_delivery.valid,false);assert.equal(report.critical_security.valid,false);assert.equal(report.voice_notes.valid,false);
  assert.equal(evidence.monitoring.runtime_errors_checked,false);assert.equal(evidence.monitoring.alert_delivery_verified,false);assert.equal(evidence.critical_gates.security,null);assert.equal(evidence.feature_gates.voice_notes,null);
});

test('wrong release identity cannot inherit a prior technical, alert, security or voice PASS',()=>{
  const wrong={...base,expected_main_sha:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',production_deployment:{...base.production_deployment,id:'dpl_other',source_commit:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'}};
  const {evidence}=mergeTechnicalEvidence(wrong,review,{now:NOW});
  assert.equal(evidence.monitoring.runtime_errors_checked,false);assert.equal(evidence.monitoring.alert_delivery_verified,false);assert.equal(evidence.critical_gates.security,null);assert.equal(evidence.feature_gates.voice_notes,null);
});

test('alert PASS requires the reserved Slack channel, readback, safe payload and a real message identity',()=>{
  for(const mutate of [x=>{x.alert_delivery.channel_id='C_OTHER'},x=>{x.alert_delivery.readback_verified=false},x=>{x.alert_delivery.contains_secrets_or_customer_data=true},x=>{x.alert_delivery.message_ts='not-a-message'},x=>{x.alert_delivery.message_link='https://example.com/fake'}]){
    const unsafe=structuredClone(review);mutate(unsafe);const {evidence,report}=mergeTechnicalEvidence(base,unsafe,{now:NOW});assert.equal(report.alert_delivery.valid,false);assert.equal(evidence.monitoring.alert_delivery_verified,false);
  }
});

test('security PASS requires all reviewed public-definer functions and safety assertions',()=>{const unsafe=structuredClone(review);unsafe.security.review_basis.booking_abuse_guard_trigger_present=false;unsafe.security.reviewed_functions.shift();const {evidence}=mergeTechnicalEvidence(base,unsafe,{now:NOW});assert.equal(evidence.critical_gates.security,null)});
test('security PASS rejects an advisor ERROR while accepting a clean INFO-only result',()=>{const clean=mergeTechnicalEvidence(base,review,{now:NOW});assert.equal(clean.evidence.critical_gates.security,'PASS');const unsafe=structuredClone(review);unsafe.security.advisor_max_level='ERROR';const {evidence}=mergeTechnicalEvidence(base,unsafe,{now:NOW});assert.equal(evidence.critical_gates.security,null)});

test('Voice Notes never inherits text WhatsApp readiness and requires external, fail-closed, isolation and privileged-surface proof',()=>{
  for(const mutate of [
    x=>{delete x.voice_notes},x=>{x.voice_notes.real_external_inbound_verified=false},x=>{x.voice_notes.real_external_reply_or_action_verified=false},x=>{x.voice_notes.uncertain_voice_fail_closed_verified=false},x=>{x.voice_notes.signed_webhook_verified=false},x=>{x.voice_notes.provider_media_fetch_verified=false},x=>{x.voice_notes.transcript_pipeline_verified=false},x=>{x.voice_notes.tenant_isolation_verified=false},x=>{x.voice_notes.raw_audio_persisted=true},x=>{x.voice_notes.service_role_only_functions_verified=false},x=>{x.voice_notes.contains_secrets_or_customer_data=true},x=>{x.voice_notes.reviewed_functions.pop()},x=>{x.voice_notes.evidence_refs.external_outcome=''},x=>{x.voice_notes.source_commit='wrong'},x=>{x.voice_notes.deployment_id='dpl_wrong'},
  ]){const unproven=structuredClone(review);mutate(unproven);const {evidence,report}=mergeTechnicalEvidence(base,unproven,{now:NOW});assert.equal(report.voice_notes.valid,false);assert.equal(evidence.feature_gates.voice_notes,null)}
});

test('BAR-12 workflow imports fresh technical evidence before evaluation and keeps external WhatsApp/financial/legal fail closed',()=>{
  const workflow=fs.readFileSync(new URL('../.github/workflows/dabbir-bar12-readiness.yml',import.meta.url),'utf8');const journeyWorkflow=fs.readFileSync(new URL('../.github/workflows/dabbir-ai-customer-journey.yml',import.meta.url),'utf8');
  const mergeAt=workflow.indexOf('Merge verified technical readiness evidence');const evaluateAt=workflow.indexOf('Evaluate BAR-12 readiness');assert.ok(mergeAt>0&&evaluateAt>mergeAt);
  assert.match(workflow,/\.github\/scripts\/dabbir-bar12-technical-evidence\.mjs/);assert.match(workflow,/docs\/evidence\/dabbir-bar12-technical-review\.json/);assert.match(workflow,/real_external_connection:false/);assert.match(workflow,/financial:null/);assert.match(workflow,/legal:null/);assert.match(journeyWorkflow,/- '\.github\/scripts\/dabbir-bar12-\*'/);assert.match(journeyWorkflow,/- 'test\/dabbir-bar12-\*'/);
});

test('release review is supplied after deployment; v1 and missing inputs cannot attest a Voice Notes runtime',async()=>{
  const {readTechnicalReviewInput}=await import('../.github/scripts/dabbir-bar12-technical-evidence.mjs');
  for(const raw of ['',undefined,'null','[]','{}','not-json',JSON.stringify({...review,schema_version:'dabbir_bar12_technical_review_v1'})])assert.throws(()=>readTechnicalReviewInput(raw),/BAR12_/);
  assert.throws(()=>readTechnicalReviewInput(' '.repeat(16385)+'{}'),/TOO_LARGE/);const live=readTechnicalReviewInput(JSON.stringify(review));assert.equal(mergeTechnicalEvidence(base,live,{now:NOW}).report.voice_notes.valid,true);
  const stale=mergeTechnicalEvidence(base,live,{now:NOW+25*60*60*1000});assert.equal(stale.report.runtime_monitoring.valid,false);assert.equal(stale.report.alert_delivery.valid,false);assert.equal(stale.report.critical_security.valid,false);assert.equal(stale.report.voice_notes.valid,false);
  const script=fs.readFileSync(new URL('../.github/scripts/dabbir-bar12-technical-evidence.mjs',import.meta.url),'utf8');assert.doesNotMatch(script,/docs\/evidence\/dabbir-bar12-technical-review\.json/);assert.match(script,/BAR12_TECHNICAL_EVIDENCE_UNVERIFIED/);
  const workflow=fs.readFileSync(new URL('../.github/workflows/dabbir-bar12-readiness.yml',import.meta.url),'utf8');assert.match(workflow,/DABBIR_BAR12_TECHNICAL_REVIEW_JSON: \$\{\{ inputs\.technical_review_json \|\| vars\.DABBIR_BAR12_TECHNICAL_REVIEW_JSON \}\}/);assert.doesNotMatch(workflow,/run:.*\$\{\{ inputs\.technical_review_json/);
});
