import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const EVIDENCE_PATH=process.env.DABBIR_READINESS_EVIDENCE_PATH||'dabbir-bar12-live-evidence.json';
const REVIEW_PATH=process.env.DABBIR_BAR12_TECHNICAL_REVIEW_PATH||'dabbir-bar12-technical-review-input.json';
const MERGE_REPORT_PATH=process.env.DABBIR_BAR12_TECHNICAL_MERGE_PATH||'dabbir-bar12-technical-evidence-merge.json';
const EXPECTED_PROJECT_REF='fphpoysqdsceniwduxjq';
const EXPECTED_ALERT_CHANNEL='C0BRQQER3UH';
const REVIEW_SCHEMA='dabbir_bar12_technical_review_v2';
const MAX_AGE_MS=24*60*60*1000;
const EXPECTED_VOICE_FUNCTIONS=[
  'public.dabbir_whatsapp_persist_voice_inbound',
  'public.dabbir_whatsapp_voice_claim_dispatch',
  'public.dabbir_whatsapp_voice_claim_next',
  'public.dabbir_whatsapp_voice_finalize',
  'public.dabbir_whatsapp_voice_complete_clarification',
  'public.dabbir_whatsapp_voice_fail',
];

function readJson(path){return JSON.parse(fs.readFileSync(path,'utf8'))}
function fresh(value,now){const ts=Date.parse(String(value||''));return Number.isFinite(ts)&&ts<=now&&(now-ts)<=MAX_AGE_MS}
function exactLevels(value){const levels=new Set(Array.isArray(value)?value.map(x=>String(x).toLowerCase()):[]);return ['warning','error','fatal'].every(x=>levels.has(x))}
function safeEvidenceRef(value){const ref=String(value||'').trim();return ref.length>=6&&ref.length<=300&&/^[A-Za-z0-9._:/#=@+-]+$/.test(ref)}

// Release-bound evidence must be supplied after deployment. Committing a review
// changes the SHA it claims to attest, and a historical file cannot attest a new
// runtime. Voice Notes changed the production/security surface, so v1 reviews
// are intentionally invalid and cannot be promoted after that feature exists.
export function readTechnicalReviewInput(raw){
  if(typeof raw!=='string'||!raw.trim())throw new Error('BAR12_LIVE_TECHNICAL_REVIEW_REQUIRED');
  if(Buffer.byteLength(raw,'utf8')>16384)throw new Error('BAR12_TECHNICAL_REVIEW_TOO_LARGE');
  let review;try{review=JSON.parse(raw)}catch{throw new Error('BAR12_TECHNICAL_REVIEW_INVALID_JSON')}
  if(!review||Array.isArray(review)||review.schema_version!==REVIEW_SCHEMA)throw new Error('BAR12_TECHNICAL_REVIEW_SCHEMA_INVALID');
  return review;
}

export function mergeTechnicalEvidence(base,review,{now=Date.now()}={}){
  const evidence=structuredClone(base||{});
  const deployment=evidence.production_deployment||{};
  const expectedSha=String(evidence.expected_main_sha||'').trim();
  const deploymentId=String(deployment.id||'').trim();
  const monitoring=review?.runtime_monitoring||{};
  const alert=review?.alert_delivery||{};
  const security=review?.security||{};
  const voice=review?.voice_notes||{};
  const schemaValid=review?.schema_version===REVIEW_SCHEMA;

  const monitoringValid=
    schemaValid&&
    Boolean(expectedSha)&&Boolean(deploymentId)&&
    String(monitoring.source_commit||'')===expectedSha&&
    String(monitoring.deployment_id||'')===deploymentId&&
    String(monitoring.origin||'')==='https://dabbir.bmalman.com'&&
    Number(monitoring.window_hours)===24&&
    Number(monitoring.matching_logs)===0&&
    exactLevels(monitoring.levels_checked)&&
    fresh(monitoring.checked_at,now);

  const alertLink=String(alert.message_link||'');
  const alertTs=String(alert.message_ts||'');
  const alertValid=
    schemaValid&&
    Boolean(expectedSha)&&Boolean(deploymentId)&&
    String(alert.source_commit||'')===expectedSha&&
    String(alert.deployment_id||'')===deploymentId&&
    String(alert.origin||'')==='https://dabbir.bmalman.com'&&
    String(alert.provider||'')==='Slack'&&
    String(alert.delivery_mode||'')==='BARMAN_EXECUTIVE_OS_TO_SLACK_OWNER_ALERT_CHANNEL'&&
    String(alert.channel_id||'')===EXPECTED_ALERT_CHANNEL&&
    String(alert.channel_name||'')==='barman-executive-alerts'&&
    /^\d{10,}\.\d{6}$/.test(alertTs)&&
    alertLink.startsWith(`https://barman-global.slack.com/archives/${EXPECTED_ALERT_CHANNEL}/p`)&&
    alert.readback_verified===true&&
    alert.test_only===true&&
    alert.contains_secrets_or_customer_data===false&&
    fresh(alert.verified_at,now);

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
    alert_delivery_verified:alertValid,
    alert_delivery:alertValid?{
      source_commit:expectedSha,
      deployment_id:deploymentId,
      verified_at:alert.verified_at,
      provider:'Slack',
      delivery_mode:alert.delivery_mode,
      channel_id:EXPECTED_ALERT_CHANNEL,
      channel_name:'barman-executive-alerts',
      message_ts:alertTs,
      message_link:alertLink,
      readback_verified:true,
      test_only:true,
    }:null,
  };

  const reviewedFunctions=new Set([
    ...(Array.isArray(security.reviewed_warnings)?security.reviewed_warnings:[]),
    ...(Array.isArray(security.reviewed_functions)?security.reviewed_functions:[]),
  ]);
  const basis=security.review_basis||{};
  const expectedWarnings=[
    'public.dabbir_public_car_wash_book',
    'public.dabbir_public_car_wash_catalog',
    'public.dabbir_public_car_wash_slots',
    'public.dabbir_public_order_status',
  ];
  const securityValid=
    schemaValid&&
    Boolean(expectedSha)&&
    String(security.source_commit||'')===expectedSha&&
    String(security.project_ref||'')===EXPECTED_PROJECT_REF&&
    String(security.verdict||'').toUpperCase()==='PASS'&&
    Number(security.blocking_findings)===0&&
    ['INFO','WARN'].includes(String(security.advisor_max_level||'').toUpperCase())&&
    fresh(security.reviewed_at,now)&&
    expectedWarnings.every(name=>reviewedFunctions.has(name))&&
    basis.security_advisor_rerun===true&&
    basis.public_definer_functions_reviewed===true&&
    basis.anonymous_direct_table_dml_for_booking_requests===false&&
    basis.booking_abuse_guard_trigger_present===true&&
    basis.public_catalog_is_bounded===true&&
    basis.public_slots_are_bounded===true&&
    basis.public_order_status_uses_unguessable_uuid_token===true;

  const voiceFunctions=new Set(Array.isArray(voice.reviewed_functions)?voice.reviewed_functions.map(String):[]);
  const voiceRefs=voice.evidence_refs||{};
  const voiceValid=
    schemaValid&&
    Boolean(expectedSha)&&Boolean(deploymentId)&&
    String(voice.source_commit||'')===expectedSha&&
    String(voice.deployment_id||'')===deploymentId&&
    String(voice.origin||'')==='https://dabbir.bmalman.com'&&
    String(voice.provider||'')==='Meta WhatsApp Cloud API'&&
    fresh(voice.verified_at,now)&&
    voice.real_external_inbound_verified===true&&
    voice.real_external_reply_or_action_verified===true&&
    voice.uncertain_voice_fail_closed_verified===true&&
    voice.signed_webhook_verified===true&&
    voice.provider_media_fetch_verified===true&&
    voice.transcript_pipeline_verified===true&&
    voice.tenant_isolation_verified===true&&
    voice.raw_audio_persisted===false&&
    voice.service_role_only_functions_verified===true&&
    voice.contains_secrets_or_customer_data===false&&
    EXPECTED_VOICE_FUNCTIONS.every(name=>voiceFunctions.has(name))&&
    safeEvidenceRef(voiceRefs.external_inbound)&&
    safeEvidenceRef(voiceRefs.external_outcome)&&
    safeEvidenceRef(voiceRefs.uncertain_clarification);

  evidence.critical_gates={
    ...(evidence.critical_gates||{}),
    security:securityValid?'PASS':null,
  };
  evidence.feature_gates={
    ...(evidence.feature_gates||{}),
    voice_notes:voiceValid?'PASS':null,
  };

  return {
    evidence,
    report:{
      schema_version:'dabbir_bar12_technical_merge_v2',
      generated_at:new Date(now).toISOString(),
      expected_main_sha:expectedSha||null,
      deployment_id:deploymentId||null,
      runtime_monitoring:{valid:monitoringValid,reviewed_at:monitoring.checked_at||null},
      alert_delivery:{valid:alertValid,verified_at:alert.verified_at||null,provider:alert.provider||null,channel_id:alert.channel_id||null,message_ts:alert.message_ts||null},
      critical_security:{valid:securityValid,reviewed_at:security.reviewed_at||null,project_ref:security.project_ref||null},
      voice_notes:{
        valid:voiceValid,
        verified_at:voice.verified_at||null,
        source_commit:voice.source_commit||null,
        deployment_id:voice.deployment_id||null,
        real_external_inbound_verified:voice.real_external_inbound_verified===true,
        real_external_reply_or_action_verified:voice.real_external_reply_or_action_verified===true,
        uncertain_voice_fail_closed_verified:voice.uncertain_voice_fail_closed_verified===true,
        tenant_isolation_verified:voice.tenant_isolation_verified===true,
      },
      intentionally_unpromoted:{financial:true,legal:true,real_external_whatsapp:true},
    },
  };
}

export function run(){
  const base=readJson(EVIDENCE_PATH);
  const raw=process.env.DABBIR_BAR12_TECHNICAL_REVIEW_JSON;
  const supplied=raw ?? (fs.existsSync(REVIEW_PATH)?fs.readFileSync(REVIEW_PATH,'utf8'):'');
  let review={},inputError=null;
  try{review=readTechnicalReviewInput(supplied)}
  catch(error){inputError=String(error?.message||error)}
  fs.writeFileSync(REVIEW_PATH,JSON.stringify(inputError?{schema_version:null,input_error:inputError}:review,null,2));
  const merged=mergeTechnicalEvidence(base,review);
  merged.report.input={valid:inputError===null,error:inputError};
  fs.writeFileSync(EVIDENCE_PATH,JSON.stringify(merged.evidence,null,2));
  fs.writeFileSync(MERGE_REPORT_PATH,JSON.stringify(merged.report,null,2));
  const invalid=[
    ['runtime_monitoring',merged.report.runtime_monitoring.valid],
    ['alert_delivery',merged.report.alert_delivery.valid],
    ['critical_security',merged.report.critical_security.valid],
    ['voice_notes',merged.report.voice_notes.valid],
  ].filter(([,valid])=>!valid).map(([name])=>name);
  if(invalid.length){
    console.warn(`BAR12_TECHNICAL_EVIDENCE_UNVERIFIED blockers=${invalid.join(',')} input_error=${inputError||'none'} sha=${merged.report.expected_main_sha}`);
  }else{
    console.log(`BAR12_TECHNICAL_EVIDENCE_MERGED runtime_monitoring=PASS alert_delivery=PASS critical_security=PASS voice_notes=PASS sha=${merged.report.expected_main_sha}`);
  }
  return merged;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)run();
