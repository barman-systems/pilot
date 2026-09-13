import {runUnderstandingTurn} from '../../../api/_dabbir-understanding-orchestrator.js';
import {activityContext} from './activity.mjs';
import {ids} from './cases.mjs';

export function dialogueHarness({type='car_wash',services,options={},planner,extra={},cognitiveMode='active'}={}) {
 const now=new Date('2026-09-09T08:00:00Z');let state={},version=0,revision=0,pending=null;const history=[],replies=[],calls=[],decisions=[];
 const catalog=services||[{id:ids.service,business_id:ids.business,branch_id:ids.branch,name_ar:'خارجي',name_en:'Exterior',price:40},
  {id:'60000000-0000-4000-8000-000000000002',business_id:ids.business,branch_id:ids.branch,name_ar:'VIP',name_en:'VIP',price:100}];
 const c=activityContext({business:{id:ids.business,timezone:'Asia/Dubai',business_type:type,currency_code:'AED'},conversation:{id:ids.conversation,branch_id:ids.branch,state:'ai_active'},customer:{id:ids.customer},services:catalog,workers:[],branches:[],knowledge:[],verified_memory:[],approved_aliases:[],upcoming_appointments:[],...extra},options);
 async function turn(body,proposal=null,turnContext={}){
  revision++;now.setSeconds(now.getSeconds()+20);const message={id:`10000000-0000-4000-8000-${String(revision).padStart(12,'0')}`,body,created_at:now.toISOString()};
  const ctx={...c,batch_messages:[message],history:history.slice(-8),pending_state:pending,...turnContext};
  const claim={batch_id:'batch-'+revision,lock_token:'lock',attempt_count:1};
  const rpc=async(name,args)=>{calls.push({name,args});
   if(name==='dabbir_semantic_load_v2')return {semantic_state:structuredClone(state),version,message_revision:revision};
   if(name==='dabbir_semantic_commit_v2'){state=structuredClone(args.p_state);decisions.push(args.p_metrics);return {version:++version,state,replay:false};}
   if(name==='dabbir_semantic_set_pending_v2'){pending={pending_action:args.p_action,payload:args.p_payload,expires_at:new Date(now.getTime()+900000).toISOString()};return true;}
   if(['dabbir_semantic_check_availability_v1','dabbir_whatsapp_ai_check_availability'].includes(name))return {slots:[]};
   if(name==='dabbir_semantic_execute_v2')throw Error('UNEXPECTED_MUTATION');
   return true;
  };
  history.push({sender_type:'customer',body,created_at:now.toISOString()});
  const result=await runUnderstandingTurn({claim,context:ctx,rpc,now:()=>new Date(now),cognitiveMode,
   deliver:async(_claim,_ctx,text)=>{replies.push(text);history.push({sender_type:'ai',body:text,created_at:now.toISOString()});return {providerMessageId:'receipt-'+revision};},
   finish:async()=>true,handoff:async()=>true,bookingText:()=>'',slotsText:()=>'',
   planner:planner?async(_ctx,snapshot)=>planner(body,snapshot,proposal):undefined});
  return {result,state:structuredClone(state),reply:replies.at(-1)};
 }
 return {turn,c,replies,calls,decisions,get state(){return state;}};
}
