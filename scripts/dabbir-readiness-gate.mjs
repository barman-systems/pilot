import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { classifyProductionOrigin } from './dabbir-production-origin-gate.mjs';
import { deriveReleaseState } from './dabbir-release-state-machine.mjs';

const CONTRACT_PATH='config/barman-integration-contract.json';
const EVIDENCE_PATH=process.env.DABBIR_READINESS_EVIDENCE_PATH||'dabbir-bar12-live-evidence.json';
const REPORT_PATH=process.env.DABBIR_READINESS_REPORT_PATH||'dabbir-bar12-readiness-report.json';
const PASS='PASS';
const BLOCKED='BLOCKED';
const INSUFFICIENT='INSUFFICIENT_EVIDENCE';

function gate(key,state,detail,evidence=null){return {key,state,detail,evidence}}
function finite(value){return value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))}
function nonnegative(value){return finite(value)&&Number(value)>=0}
function ratio(value){return finite(value)&&Number(value)>=0&&Number(value)<=1}
function readJson(path,fallback={}){try{return JSON.parse(fs.readFileSync(path,'utf8'))}catch{return fallback}}
function append(path,text){if(path)fs.appendFileSync(path,text)}

export function evaluateReadiness({contract,evidence={},productionOrigin=''}){
  const gates=[];
  let originResult;
  try{originResult=classifyProductionOrigin({origin:productionOrigin,contract})}
  catch(error){originResult={ready:false,state:'INVALID_PUBLIC_LAUNCH_CONTRACT',reason:String(error?.message||error)}}
  gates.push(gate('public_launch_contract',originResult.ready?PASS:BLOCKED,originResult.reason,{state:originResult.state,origin:originResult.origin||null}));

  const deployment=evidence.production_deployment||{};
  const expectedCommit=String(evidence.expected_main_sha||'').trim();
  const deploymentCommit=String(deployment.source_commit||'').trim();
  const journey=evidence.end_to_end_journey||{};
  const release=deriveReleaseState({
    expectedMainSha:expectedCommit,
    candidateBuild:evidence.candidate_build||{},
    exactShaTests:evidence.exact_sha_tests||{},
    deployment,
    journey,
    iphoneSafariAr:evidence.iphone_safari_ar||{},
    iphoneSafariEn:evidence.iphone_safari_en||{},
  });
  const releaseGateState=release.ready?PASS:release.stage?BLOCKED:INSUFFICIENT;
  gates.push(gate(
    'release_state_machine',
    releaseGateState,
    release.ready?'Release reached production_journey_verified on the exact production SHA.':`Release stopped at ${release.stage||'pre-build'}: ${release.reason}.`,
    {stage:release.stage,ready:release.ready,reason:release.reason,expected_main_sha:expectedCommit||null},
  ));

  if(!deployment.state||!deploymentCommit||!expectedCommit){
    gates.push(gate('production_deployment',INSUFFICIENT,'Exact READY production deployment and source commit have not both been evidenced.'));
  }else if(String(deployment.state).toUpperCase()!=='READY'||deploymentCommit!==expectedCommit){
    gates.push(gate('production_deployment',BLOCKED,'Production deployment is not READY on the exact expected main SHA.',{state:deployment.state,source_commit:deploymentCommit,expected_main_sha:expectedCommit}));
  }else{
    gates.push(gate('production_deployment',PASS,'Production is READY on the exact expected main SHA.',{deployment_id:deployment.id||null,source_commit:deploymentCommit}));
  }

  const realExternal=journey.real_external_connection===true&&journey.real_inbound_message===true&&journey.approved_reply_verified===true;
  if(journey.verdict!=='PASS')gates.push(gate('end_to_end_journey',journey.verdict?BLOCKED:INSUFFICIENT,'The required signup → business type → connection → inbound → reply/action journey has not passed.'));
  else if(!realExternal)gates.push(gate('end_to_end_journey',BLOCKED,'A Web-only journey cannot satisfy BAR-12; real external connection, inbound message, and approved reply must all be verified.'));
  else gates.push(gate('end_to_end_journey',PASS,'Full external end-to-end journey is verified.'));

  for(const [key,label] of [['iphone_safari_ar','Arabic iPhone Safari'],['iphone_safari_en','English iPhone Safari']]){
    const row=evidence[key]||{};
    gates.push(gate(key,row.verdict==='PASS'?PASS:row.verdict?BLOCKED:INSUFFICIENT,row.verdict==='PASS'?`${label} journey passed.`:`${label} journey has not been evidenced as PASS.`,row));
  }

  const live=evidence.live_evidence?.evidence||evidence.live_evidence||{};
  const wa=live.whatsapp||{};
  gates.push(gate('whatsapp_connection',Number(wa.operational_connections)>0&&Number(wa.verified_connections)>0?PASS:BLOCKED,'At least one real tenant WhatsApp connection must be operational and provider-verified.',{operational_connections:Number(wa.operational_connections||0),verified_connections:Number(wa.verified_connections||0)}));
  gates.push(gate('whatsapp_inbound',Number(wa.inbound_conversations)>0&&Number(wa.inbound_messages)>0?PASS:BLOCKED,'At least one non-simulated WhatsApp inbound conversation/message is required.',{inbound_conversations:Number(wa.inbound_conversations||0),inbound_messages:Number(wa.inbound_messages||0)}));
  gates.push(gate('whatsapp_reply',Number(wa.verified_replies)>0?PASS:BLOCKED,'At least one WhatsApp reply/action must have verified_external_result=true.',{verified_replies:Number(wa.verified_replies||0)}));

  const monitoring=evidence.monitoring||{};
  gates.push(gate('runtime_error_monitoring',monitoring.runtime_errors_checked===true?PASS:INSUFFICIENT,'Runtime error monitoring must be queried for the exact production artifact.',monitoring.runtime_errors||null));
  gates.push(gate('alerting',monitoring.alert_delivery_verified===true?PASS:INSUFFICIENT,'An actual alert delivery path must be verified; a dashboard alone is not alerting evidence.',monitoring.alert_delivery||null));

  gates.push(gate('setup_time_metric',nonnegative(wa.setup_time_seconds)?PASS:INSUFFICIENT,'Setup time must be measured from real business creation to real channel connection.',{setup_time_seconds:wa.setup_time_seconds??null}));
  gates.push(gate('connection_success_metric',ratio(wa.connection_success_rate)?PASS:INSUFFICIENT,'Connection success rate requires a durable attempt denominator; do not infer it from connection rows.',{connection_success_rate:wa.connection_success_rate??null}));
  gates.push(gate('messages_processed_metric',Number(wa.inbound_messages)>0?PASS:INSUFFICIENT,'Real processed channel messages are required for the messages-processed KPI.',{messages_processed:Number(wa.inbound_messages||0)}));
  const handoffs=live.handoffs||{};
  gates.push(gate('human_handoff_metric',ratio(handoffs.rate)?PASS:INSUFFICIENT,'Human handoff rate must be measured against real external conversations.',{handoff_rate:handoffs.rate??null,routed_to_human:Number(handoffs.routed_to_human||0)}));
  const satisfaction=live.satisfaction||{};
  gates.push(gate('satisfaction_metric',Number(satisfaction.samples)>0&&finite(satisfaction.score)?PASS:INSUFFICIENT,'User satisfaction requires at least one durable real feedback sample.',{samples:Number(satisfaction.samples||0),score:satisfaction.score??null}));

  const critical=evidence.critical_gates||{};
  for(const area of ['security','financial','legal']){
    const value=String(critical[area]||'').toUpperCase();
    gates.push(gate(`critical_${area}`,value==='PASS'?PASS:value?BLOCKED:INSUFFICIENT,`Critical ${area} gate must explicitly PASS before launch.`,{verdict:value||null}));
  }

  const blockers=gates.filter(row=>row.state!==PASS);
  return {schema_version:'dabbir_bar12_readiness_v2',generated_at:new Date().toISOString(),release_stage:release.stage,release_ready:release.ready,verdict:blockers.length===0?'READY':'BLOCKED',blocker_count:blockers.length,gates};
}

export function runGate({contractPath=CONTRACT_PATH,evidencePath=EVIDENCE_PATH,productionOrigin=process.env.PRODUCTION_ORIGIN||''}={}){
  const contract=readJson(contractPath,null);
  if(!contract)throw new Error('DABBIR_INTEGRATION_CONTRACT_REQUIRED');
  const evidence=readJson(evidencePath,{});
  const report=evaluateReadiness({contract,evidence,productionOrigin});
  fs.writeFileSync(REPORT_PATH,JSON.stringify(report,null,2));
  append(process.env.GITHUB_OUTPUT,`readiness=${report.verdict}\nrelease_stage=${report.release_stage||'pre-build'}\nblocker_count=${report.blocker_count}\n`);
  append(process.env.GITHUB_STEP_SUMMARY,`## DABBIR BAR-12 Readiness\n\n**Verdict:** ${report.verdict}\n\n**Release stage:** ${report.release_stage||'pre-build'}\n\n**Blockers:** ${report.blocker_count}\n\n| Gate | State | Detail |\n|---|---|---|\n${report.gates.map(row=>`| ${row.key} | ${row.state} | ${String(row.detail).replaceAll('|','\\|')} |`).join('\n')}\n`);
  console.log(`DABBIR BAR-12 READINESS: ${report.verdict} (${report.blocker_count} blockers) release=${report.release_stage||'pre-build'}`);
  const publicGate=report.gates.find(row=>row.key==='public_launch_contract');
  const enforcePublic=String(process.env.DABBIR_READINESS_ENFORCE_PUBLIC_ONLY||'true').toLowerCase()!=='false';
  if(enforcePublic&&publicGate?.state===PASS&&report.verdict!=='READY')process.exitCode=1;
  return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)runGate();
