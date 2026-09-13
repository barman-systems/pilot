// Synthetic contract fixture. Never imported by api/ or used against production.
export const ID={root:'10000000-0000-4000-8000-000000000001',customer:'10000000-0000-4000-8000-000000000002',business:'20000000-0000-4000-8000-000000000001',entity:'30000000-0000-4000-8000-000000000001',case:'40000000-0000-4000-8000-000000000001',command:'50000000-0000-4000-8000-000000000001',decision:'60000000-0000-4000-8000-000000000001',audit:'70000000-0000-4000-8000-000000000001',delegate:'80000000-0000-4000-8000-000000000001'};
export function ownerFixture(){
 const stamp='2026-09-06T12:00:00Z',calls=[],identity={authenticated:true,authority_role:'ROOT_OWNER',display_name:'QA Owner',permissions:[],granular_permissions:[],access_scope:{type:'ALL_BUSINESSES'},expires_at:'2026-09-07T12:00:00Z'};
 const business={id:ID.business,name:'QA synthetic business',country:'AE',currency:'AED',demo_mode:true,plan:{status:'trialing'},whatsapp:{state:'verification_required'}};
 const state={identity,fail:null,bad:null,readbackFail:false,entities:{ORDER:[{id:ID.entity,status:'pending',total_aed:125}],BOOKING:[{id:ID.entity,status:'confirmed',starts_at:stamp}],PRODUCT:[{id:ID.entity,name:'QA product <script>alert(1)</script>',price_aed:125,active:true}],SERVICE:[{id:ID.entity,name:'QA service',price_aed:125,active:true}],BRANCH:[{id:ID.entity,name:'QA branch',status:'active',is_primary:false}],WHATSAPP:[{id:ID.entity,status:'verification_required',last_verified_at:null}],CALENDAR:[{id:ID.entity,provider:'google',sync_enabled:false,status:'active',last_sync_at:stamp}]},cases:[],incidents:[],commands:[{id:ID.command,command_text:'QA fixture mission',priority:'P1',status:'BLOCKED',objective:'Verify behavior',acceptance_criteria:['Saved result'],created_at:stamp,due_at:null,guidance:[],actions:[],blocked_reason:'Waiting for evidence'}],decisions:[{id:ID.decision,status:'open',question:'QA fixture decision?',action_description:'Synthetic review',created_at:stamp}],staff:[{user_id:ID.root,email:'root@example.invalid',display_name:'QA Owner',role:'ROOT_OWNER',active:true,access_scope:{type:'ALL_BUSINESSES'},active_sessions:1},{user_id:ID.delegate,email:'delegate@example.invalid',display_name:'QA Delegate',role:'OWNER_DELEGATE',role_code:'CUSTOM',active:true,granular_permissions:['customers.view'],access_scope:{type:'SPECIFIC_BUSINESS',business_id:ID.business},active_sessions:1,mfa_required:false}],invitations:[],audit:[]};
 const response=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json'}});
 async function fetchBroker(url,init){
  if(String(url)!=='https://owner-broker.test')throw new Error('FIXTURE_EXTERNAL_NETWORK_FORBIDDEN');
  const b=JSON.parse(init.body);calls.push(b);
  if(!b.session_token||b.session_token==='expired')return response({ok:false,authenticated:false,error:'OWNER_SESSION_REQUIRED'},401);
  if(b.action==='owner_session_verify')return state.fail==='verify'?response({ok:false,error:'UNAVAILABLE'},503):response({...identity,session_token:'must-never-render'});
  if(b.action!=='owner_data')return response({ok:false,error:'UNKNOWN_ACTION'},400);
  const action=b.data_action;
  if(state.fail===action||state.readbackFail&&calls.some(c=>c.data_action?.endsWith('_execute'))&&action==='operation_entities')return response({ok:false,error:'FIXTURE_READ_FAILURE'},503);
  if(state.bad===action)return response({ok:true,payload:null});
  let payload;
  if(action==='identity')payload=identity;
  else if(action==='overview')payload={generated_at:stamp,scope:'GLOBAL',customers:{accounts:1,live_businesses:0},support:{open:state.cases.filter(c=>c.status!=='resolved').length,sla_breached:0},incidents:{open:state.incidents.length,critical:0},ceo:{blocked:1,decisions_waiting:state.decisions.filter(d=>d.status==='open').length},whatsapp:{configured:0,verified_recent:0,error:0},calendar:{configured:1,verified_recent:0,error:0},payments:{failed:0,environment:'SANDBOX_ONLY'},system:{runtime_5xx_24h:null,runtime_5xx_state:'NEEDS_INSTRUMENTATION',sample_count_24h:0,api_p95_ms:null}};
  else if(action==='executive')payload={executive_pulse:{active_customers:1,trialing:1,paid_subscribers:0},revenue:{mrr_aed:null,environment:'sandbox_only'},reliability:{database_rpc_latency_ms:12,backup_state:'RECOVERY_VAULT_SNAPSHOT',backup_last_at:stamp,restore_test_state:'DRY_RUN_VERIFIED',restore_test_last_at:stamp}};
  else if(action==='search')payload={accounts:b.q==='missing'?[]:[{user_id:ID.customer,customer_no:'DAB-900001',email:'customer@example.invalid',access_status:'active'}]};
  else if(action==='customer360')payload={customer_no:'DAB-900001',account:{user_id:ID.customer,email:'customer@example.invalid',last_login:stamp},businesses:[business]};
  else if(action==='operations')payload={businesses:[business]};
  else if(action==='operation_entities')payload={entities:state.entities[b.entity_type]||[]};
  else if(action==='operation_execute'){
   const type=b.operation.split('_')[0],entity=state.entities[type].find(row=>row.id===b.entity_id);if(!entity)throw new Error('FIXTURE_ENTITY_NOT_FOUND');
   const before={...entity};Object.assign(entity,b.payload);payload={result:'SUCCESS',audit_id:ID.audit,before_state:before,after_state:{...entity},timestamp:stamp};state.audit.push({id:ID.audit,created_at:stamp,action:b.operation,result:'SUCCESS',reason:b.reason});
  }else if(action==='support')payload={cases:state.cases};
  else if(action==='support_action'){
   let row=state.cases.find(c=>c.id===b.case_id);
   if(b.operation==='CREATE'){row={...b,id:ID.case,status:'open',created_at:stamp,updated_at:stamp,notes:[]};state.cases.push(row)}
   if(!row)throw new Error('FIXTURE_CASE_NOT_FOUND');
   if(b.operation==='UPDATE')for(const key of ['priority','status','resolution','diagnostic'])if(b[key])row[key]=b[key];
   if(b.operation==='REPLY_CUSTOMER'){row.messages||=[];row.messages.push({id:ID.audit,author_kind:'support',body:b.note,created_at:stamp});row.status='waiting'}
   else if(b.note)row.notes.push({id:ID.audit,note:b.note,created_at:stamp});payload=b.operation==='REPLY_CUSTOMER'?{id:row.id,message_id:ID.audit,status:'waiting'}:{case_id:row.id,action:b.operation,result:'SUCCESS'};state.audit.push({id:ID.audit,action:'SUPPORT_'+b.operation,result:'SUCCESS',created_at:stamp});
  }else if(action==='incidents')payload={incidents:state.incidents,events:[]};
  else if(action==='incident_action'){
   if(b.operation==='create'){state.incidents.push({...b,id:ID.case,status:'open',created_at:stamp,updated_at:stamp});payload={ok:true,incident_id:ID.case}}
   else{const row=state.incidents.find(i=>i.id===b.incident_id);Object.assign(row,b);payload={ok:true,incident:row}}
  }else if(action==='feedback')payload={feedback:[{id:ID.case,feedback:'QA fixture feedback',screen_feature:'Booking',date:stamp,status:'new'}]};
  else if(action==='audit')payload={entries:state.audit};
  else if(action==='ceo_commands')payload={commands:state.commands};
  else if(action==='ceo_command_create'){
   const command={id:crypto.randomUUID(),...b,status:'QUEUED',actions:[],guidance:[],created_at:stamp,executive_event_id:ID.audit};state.commands.unshift(command);payload={command};
  }else if(action==='ceo_command_update'){
   const row=state.commands.find(c=>c.id===b.command_id);if(!row)throw new Error('FIXTURE_COMMAND_NOT_FOUND');
   if(b.operation==='reprioritize')row.priority=b.priority;else if(b.operation==='set_due_at')row.due_at=b.due_at;else if(b.operation==='add_guidance')row.guidance.push({text:b.guidance,at:stamp});else row.status=b.operation==='cancel'?'CANCELLED':'QUEUED';payload={command:row};
  }else if(action==='decisions')payload={decisions:state.decisions};
  else if(action==='decision_resolve'){const row=state.decisions.find(d=>d.id===b.escalation_id);row.status='resolved';row.decision={resolution:b.resolution,note:b.note};payload={decision:row}}
  else if(action==='team'){
   if(b.operation==='list')payload={staff:state.staff,invitations:state.invitations,roles:[{code:'OPERATIONS_MANAGER',name_ar:'مدير العمليات',name_en:'Operations manager',permissions:['businesses.view','businesses.edit','customers.view']},{code:'CUSTOM',name_ar:'مخصص',name_en:'Custom',permissions:['customers.view','support.view','support.reply']}]};
   else if(b.operation.startsWith('invite')){
    let row=state.invitations.find(i=>i.id===b.invitation_id);
    if(b.operation==='invite'){row={...b,id:ID.case,status:'PENDING',delivery_status:'SENT',expires_at:stamp};state.invitations.push(row)}
    if(!row)throw new Error('FIXTURE_INVITE_NOT_FOUND');if(b.operation==='invite_revoke')row.status='REVOKED';payload=row;
   }else{const row=state.staff.find(r=>r.user_id===b.target_user_id);if(row?.role==='ROOT_OWNER')return response({ok:false,error:'DABBIR_ROOT_OWNER_PROTECTED'},403);if(!row)throw new Error('FIXTURE_STAFF_NOT_FOUND');
    if(b.operation==='set_governance')for(const key of ['role_code','granular_permissions','access_scope','access_expires_at','mfa_required','approval_limit_aed'])row[key]=b[key];
    if(b.operation==='suspend')row.suspended_at=stamp;if(b.operation==='remove')row.revoked_at=stamp;if(b.operation==='reactivate'){row.active=true;row.suspended_at=null;row.revoked_at=null}row.active_sessions=0;payload=row;
   }
  }else throw new Error('UNSUPPORTED_FIXTURE_ACTION:'+action);
  return response({ok:true,payload});
 }
 return {state,calls,fetchBroker};
}
