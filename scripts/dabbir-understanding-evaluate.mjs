import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {understandConversation} from '../api/_dabbir-semantic-engine.js';
import {resolveRequestedLocal} from '../api/_dabbir-whatsapp-understanding.js';
import {evaluationCases,baseCases,context,now} from '../test/fixtures/understanding/cases.mjs';
const mutations=new Set(['CREATE_BOOKING','CANCEL_BOOKING','RESCHEDULE_BOOKING']);
const results=evaluationCases.map(c=>{let previous,r;for(const body of c.turns){r=understandConversation({context:context({...c.extra,batch_messages:[{body}]}),previous,now});previous=r.state;}const checks=Object.entries(c.expected).map(([k,want])=>{const actual=k==='intent'?r.state.intent:k==='action'?r.decision.action:k==='missing'?r.state.missing_fields:k==='source'?r.state.entities.time?.source:r.state.entities[k]?.value??null;return {field:k,pass:JSON.stringify(want)===JSON.stringify(actual)};});return {id:c.id,tags:c.tags,checks,action:r.decision.action,expected_action:c.expected.action};});
const rate=items=>({passed:items.filter(Boolean).length,total:items.length,percent:items.length?Math.round(items.filter(Boolean).length/items.length*10000)/100:null});
const checks=(filter,fields)=>results.filter(filter).flatMap(r=>r.checks.filter(c=>fields.includes(c.field)).map(c=>c.pass));
const measured={
 intent_accuracy:rate(checks(()=>true,['intent'])),
 entity_accuracy:rate(checks(()=>true,['service','date','time','worker','appointment','slot','vehicle'])),
 reference_resolution_accuracy:rate(checks(r=>r.tags.includes('reference'),['appointment','slot','action'])),
 correction_resolution_accuracy:rate(checks(r=>r.tags.includes('correction'),['time','date','source','action'])),
 missing_field_detection_accuracy:rate(checks(()=>true,['missing'])),
 clarification_precision:rate(checks(r=>r.action==='CLARIFY',['action'])),
 tool_selection_accuracy:rate(checks(()=>true,['action'])),
 mutation_safety_rate:rate(results.filter(r=>!mutations.has(r.expected_action)).map(r=>!mutations.has(r.action))),
 cross_tenant_isolation_contract:rate(checks(r=>r.tags.includes('isolation'),['action','service'])),
 voice_semantic_accuracy:rate(checks(r=>r.tags.includes('voice'),['action','intent','date','time','missing'])),
};
const baseline=baseCases.filter(c=>c.expected.time!=null).map(c=>{const r=resolveRequestedLocal(c.turns.at(-1),'Asia/Dubai',{now});return {id:c.id,pass:r.local?.slice(11,16)===c.expected.time};});
const report={suite:'DABBIR Understanding V2',generated_at:new Date().toISOString(),source_sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 scope:'Synthetic labeled contracts, deterministic reducer, no external model and no real Meta inbound. Punctuation variants are reported separately from distinct cases.',
 distinct_scenarios:baseCases.length,total_variants:evaluationCases.length,all_cases:rate(results.map(r=>r.checks.every(c=>c.pass))),measured,
 baseline:{full_project_tests:{passed:1461,total:1461,sha:'fce8deb8aea041a2232edbe4fd940017b3f4ef8f'},legacy_deterministic_time_parser_only:rate(baseline.map(c=>c.pass)),v2_same_time_cases:rate(results.filter(r=>baseline.some(b=>b.id===r.id)).flatMap(r=>r.checks.filter(c=>c.field==='time').map(c=>c.pass))),caveat:'This compares the actual legacy deterministic time parser against the reducer on the same labeled time cases. It is not a full LLM or production baseline.',time_cases:baseline},
 unmeasured:{full_live_llm_before_after:'No controlled live provider comparison yet',production_booking_completion:'Not yet measured',production_hallucination_rate:'Not yet measured',real_meta_whatsapp_e2e:'Not yet performed'},failures:results.filter(r=>r.checks.some(c=>!c.pass))};
const out=process.env.DABBIR_UNDERSTANDING_REPORT||'docs/audits/DABBIR_UNDERSTANDING_V2_EVALUATION.json';fs.mkdirSync(new URL('../docs/audits/',import.meta.url),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({distinct:report.distinct_scenarios,variants:report.total_variants,all:report.all_cases,measured,baseline:report.baseline.legacy_deterministic_time_parser_only},null,2));if(report.failures.length)process.exitCode=1;
