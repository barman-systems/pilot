import fs from 'node:fs';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {unseenSpec} from '../test/fixtures/understanding/unseen-spec.mjs';
import {materialize} from './dabbir-unseen-evaluate.mjs';
const {runUnderstandingTurn}=await import(process.env.DABBIR_UNSEEN_ENGINE_ROOT?pathToFileURL(path.resolve(process.env.DABBIR_UNSEEN_ENGINE_ROOT,'api/_dabbir-understanding-orchestrator.js')).href:new URL('../api/_dabbir-understanding-orchestrator.js',import.meta.url).href);
const result=[];
for(const spec of unseenSpec){
 const item=materialize(spec);let state={},version=0,revision=0,pending=item.business_state.pending_state||null,decision;
 const replies=[],toolCalls=[],trace=[];let lastError=null;
 for(const [i,body] of [...item.input_history,item.current_message].entries()){
  const c={...structuredClone(item.business_state),batch_messages:[{body}],pending_state:pending,history:[]};
  const rpc=async(name,args)=>{
   if(name==='dabbir_semantic_load_v2')return {semantic_state:state,version,message_revision:++revision,activity_profile:c.activity_profile,verified_memory:c.verified_memory,operational_history:c.operational_history};
   if(name==='dabbir_semantic_commit_v2'){state=structuredClone(args.p_state);decision=args.p_metrics;return {state,version:++version};}
   if(name==='dabbir_semantic_set_pending_v2'){pending={pending_action:args.p_action,payload:args.p_payload,expires_at:'2026-09-10T08:15:00Z'};return true;}
   if(name==='dabbir_semantic_check_availability_v1'){toolCalls.push({turn:i,action:'CHECK_AVAILABILITY',verified:true});return {slots:[]};}
   if(name==='dabbir_semantic_execute_v2'){toolCalls.push({turn:i,action:args.p_action,verified:true});return {verified:true,appointment_id:'synthetic-receipt',starts_at:'2026-09-11T14:00:00Z'};}
   return true;
  };
  try{
   const outcome=await runUnderstandingTurn({context:c,claim:{batch_id:'fixture-'+i,lock_token:'fixture-lock'},rpc,cognitiveMode:'active',now:()=>new Date(Date.parse(item.reference_time)+i*(item.options.gapHours?item.options.gapHours*3600000:1000)),deliver:async(_claim,_c,text)=>{replies.push({turn:i,text});return {providerMessageId:'fixture-receipt-'+i};},handoff:async()=>{toolCalls.push({turn:i,action:'HANDOFF',verified:true});},finish:async()=>true,bookingText:()=> 'تم حجز الموعد.',slotsText:()=> 'اختر الوقت.'});
   if(outcome.action==='SUPERSEDED')decision={action:outcome.action};
   trace.push({action:decision?.action,goal:state.goal,field:state.clarification_entity});
  }catch(e){lastError=e.code||e.message;break;}
 }
 const actual=k=>k==='goal'?state.goal:k==='action'?decision?.action:k==='field'?state.clarification_entity:k==='part'?state.entities?.time?.part??null:k==='mode'?state.entities?.delivery_mode?.value??null:state.entities?.[k]?.value??null;
 const checks=Object.entries(item.expected_state_change).map(([field,expected])=>({field,expected,actual:actual(field),pass:JSON.stringify(expected)===JSON.stringify(actual(field))}));
 const unnecessaryQuestion=decision?.action==='CLARIFY'&&item.must_not_ask.includes(state.clarification_entity);
 result.push({id:item.id,activity:item.activity,pass:!lastError&&checks.every(c=>c.pass)&&!unnecessaryQuestion,checks,error:lastError,question_evaluated:item.must_not_ask.length>0,unnecessary_question:unnecessaryQuestion,replies,toolCalls,trace});
}
const metric=rows=>({correct:rows.filter(c=>c.pass).length,total:rows.length,percent:rows.length?Number((100*rows.filter(c=>c.pass).length/rows.length).toFixed(2)):null});
const all=result.flatMap(r=>r.checks),entities=['service','worker','vehicle','location','slot','appointment','date','time','mode','price'];
const report={spec_sha256:crypto.createHash('sha256').update(fs.readFileSync(new URL('../test/fixtures/understanding/unseen-spec.mjs',import.meta.url))).digest('hex'),scope:'Actual orchestrator, deterministic interpretation, fixture SQL/Meta adapters. No real provider or database execution claimed.',cases:result.length,passed:result.filter(r=>r.pass).length,metrics:{goal_understanding:metric(all.filter(c=>c.field==='goal')),entity_resolution:metric(all.filter(c=>entities.includes(c.field))),reference_resolution:metric(result.filter(r=>/^(history|reference)\//.test(r.id)).flatMap(r=>r.checks.filter(c=>entities.includes(c.field)))),context_carryover:metric(result.filter(r=>/^(carry|history|complex)\//.test(r.id)).flatMap(r=>r.checks.filter(c=>entities.includes(c.field)))),next_action:metric(all.filter(c=>c.field==='action')),tool_selection:metric(result.filter(r=>r.checks.some(c=>c.field==='action'&&['CHECK_AVAILABILITY','CREATE_BOOKING','CANCEL_BOOKING','RESCHEDULE_BOOKING','HANDOFF'].includes(c.expected))).map(r=>({pass:r.toolCalls.at(-1)?.action===r.checks.find(c=>c.field==='action').expected}))),hallucinated_action_rate:null,state_persistence_accuracy:null},results:result};
report.metrics.unnecessary_question={count:result.filter(r=>r.unnecessary_question).length,total:result.filter(r=>r.question_evaluated).length};
if(process.env.DABBIR_UNSEEN_REPORT)fs.writeFileSync(process.env.DABBIR_UNSEEN_REPORT,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,results:result.filter(r=>!r.pass).map(r=>({id:r.id,error:r.error,checks:r.checks.filter(c=>!c.pass),replies:r.replies.slice(-1)}))},null,2));
if(process.argv.includes('--gate')&&report.passed!==report.cases)process.exitCode=1;
