import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const EVIDENCE_PATH=process.env.DABBIR_READINESS_EVIDENCE_PATH||'dabbir-bar12-live-evidence.json';
const REVIEW_PATH=process.env.DABBIR_BAR12_TECHNICAL_REVIEW_PATH||'docs/evidence/dabbir-bar12-technical-review.json';
const MERGE_REPORT_PATH=process.env.DABBIR_BAR12_TECHNICAL_MERGE_PATH||'dabbir-bar12-technical-evidence-merge.json';
const EXPECTED_PROJECT_REF='fphpoysqdsceniwduxjq';
const MAX_AGE_MS=24*60*60*1000;

function readJson(path){return JSON.parse(fs.readFileSync(path,'utf8'))}
function fresh(value,now){const ts=Date.parse(String(value||''));return Number.isFinite(ts)&&ts<=now&&(now-ts)<=MAX_AGE_MS}
function exactLevels(value){const levels=new Set(Array.isArray(value)?value.map(x=>String(x).toLowerCase()):[]);return ['warning','error','fatal'].every(x=>levels.has(x))}

export function mergeTechnicalEvidence(base,review,{now=Date.now()}={}){
  const evidence=structuredClone(base||{});
  const deployment=evidence.production_deployment||{};
  const expectedSha=String(evidence.expected_main_sha||'').trim();
  const deploymentId=String(deployment.id||'').trim();
  const monitoring=review?.runtime_monitoring||{};
  const security=review?.security||{};

  const monitoringValid=
    review?.schema_version==='dabbir_bar12_technical_review_v1'&&
    Boolean(expectedSha)&&Boolean(deploymentId)&&
    String(monitoring.source_commit||'')===expectedSha&&
    String(monitoring.deployment_id||'')===deploymentId&&
    String(monitoring.origin||'')==='https://dabbir.bmalman.com'&&
    Number(monitoring.window_hours)===24&&
    Number(monitoring.matching_logs)===0&&
    exactLevels(monitoring.levels_checked)&&
    fresh(monitoring.checked_at,now);

  evidence.monitoring={
    ...(evidence.monitoring||{}),
    runtime_errors_checked:monitoringValid,
    runtime_errors:monitoringValid?{
      source_commit:expectedSha,
      deployment_id:deploymentId,
      checked_at:monitoring.checked_at,
      window_hours:24,
      levels_checked:['warning','error','fatal'],
      matching_logs:0,
      provider:String(monitoring.provider||'Vercel Runtime Logs'),
    }:null,
  };

  const reviewedWarnings=Array.isArray(security.reviewed_warnings)?security.reviewed_warnings:[];
  const basis=security.review_basis||{};
  const expectedWarnings=[
    'public.dabbir_public_car_wash_book',
    'public.dabbir_public_car_wash_catalog',
    'public.dabbir_public_car_wash_slots',
    'public.dabbir_public_order_status',
  ];
  const securityValid=
    review?.schema_version==='dabbir_bar12_technical_review_v1'&&
    Boolean(expectedSha)&&
    String(security.source_commit||'')===expectedSha&&
    String(security.project_ref||'')===EXPECTED_PROJECT_REF&&
    String(security.verdict||'').toUpperCase()==='PASS'&&
    Number(security.blocking_findings)===0&&
    String(security.advisor_max_level||'').toUpperCase()==='WARN'&&
    fresh(security.reviewed_at,now)&&
    expectedWarnings.every(name=>reviewedWarnings.includes(name))&&
    basis.security_advisor_rerun===true&&
    basis.public_definer_functions_reviewed===true&&
    basis.anonymous_direct_table_dml_for_booking_requests===false&&
    basis.booking_abuse_guard_trigger_present===true&&
    basis.public_catalog_is_bounded===true&&
    basis.public_slots_are_bounded===true&&
    basis.public_order_status_uses_unguessable_uuid_token===true;

  evidence.critical_gates={
    ...(evidence.critical_gates||{}),
    security:securityValid?'PASS':null,
  };

  return {
    evidence,
    report:{
      schema_version:'dabbir_bar12_technical_merge_v1',
      generated_at:new Date(now).toISOString(),
      expected_main_sha:expectedSha||null,
      deployment_id:deploymentId||null,
      runtime_monitoring:{valid:monitoringValid,reviewed_at:monitoring.checked_at||null},
      critical_security:{valid:securityValid,reviewed_at:security.reviewed_at||null,project_ref:security.project_ref||null},
      intentionally_unpromoted:{alert_delivery:true,financial:true,legal:true},
    },
  };
}

export function run(){
  const base=readJson(EVIDENCE_PATH);
  const review=readJson(REVIEW_PATH);
  const merged=mergeTechnicalEvidence(base,review);
  fs.writeFileSync(EVIDENCE_PATH,JSON.stringify(merged.evidence,null,2));
  fs.writeFileSync(MERGE_REPORT_PATH,JSON.stringify(merged.report,null,2));
  if(!merged.report.runtime_monitoring.valid)throw new Error('BAR12_RUNTIME_MONITORING_REVIEW_INVALID_OR_STALE');
  if(!merged.report.critical_security.valid)throw new Error('BAR12_CRITICAL_SECURITY_REVIEW_INVALID_OR_STALE');
  console.log(`BAR12_TECHNICAL_EVIDENCE_MERGED runtime_monitoring=PASS critical_security=PASS sha=${merged.report.expected_main_sha}`);
  return merged;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)run();
