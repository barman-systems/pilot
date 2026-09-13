import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
import {understandConversation} from '../api/_dabbir-semantic-engine.js';import {context,ids,offered,now as evalNow} from './fixtures/understanding/cases.mjs';
import {resumeQueuedGoal} from '../api/_dabbir-goal-queue.js';
const db=new PGlite();const batch='90000000-0000-4000-8000-000000000001',lock='90000000-0000-4000-8000-000000000002',message='90000000-0000-4000-8000-000000000003',owner='10000000-0000-4000-8000-000000000001',otherOwner='10000000-0000-4000-8000-000000000002';
const rpc=async(name,args)=>{const r=await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args);return r.rows[0].result;};
const load=()=>rpc('dabbir_semantic_load_v2',[batch,lock]);
async function reset(){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.role','service_role',false)");await db.exec('delete from dabbir_whatsapp_event_ledger;delete from dabbir_whatsapp_outbound_reservations;delete from dabbir_ai_understanding_events;delete from dabbir_customer_memory;delete from dabbir_ai_action_ledger;delete from dabbir_appointments;delete from dabbir_ai_conversation_state;delete from dabbir_message_batch_items;delete from dabbir_messages;delete from dabbir_message_batches;delete from dabbir_handoffs;');
 await db.query("update dabbir_conversations set state='ai_active',understanding_revision=0 where id=$1",[ids.conversation]);
 await db.query('insert into dabbir_messages(id,business_id,conversation_id) values($1,$2,$3)',[message,ids.business,ids.conversation]);
 await db.query('insert into dabbir_message_batches(id,business_id,conversation_id,customer_id,lock_token) values($1,$2,$3,$4,$5)',[batch,ids.business,ids.conversation,ids.customer,lock]);
 await db.query('insert into dabbir_message_batch_items(batch_id,business_id,message_id,ordinal) values($1,$2,$3,1)',[batch,ids.business,message]);
 await db.query("insert into dabbir_whatsapp_outbound_reservations(business_id,conversation_id,provider_message_id,state) values($1,$2,'verified-offer','SENT')",[ids.business,ids.conversation]);
}
async function finalizeReply(provider,purpose){
 const r=await db.query("insert into dabbir_whatsapp_outbound_reservations(business_id,conversation_id,idempotency_key,sender_type,body,state) values($1,$2,$3,'ai','Verified reply','SENDING') returning id",[ids.business,ids.conversation,'wa-understanding:'+batch+':'+purpose]);
 return (await db.query('select * from public.dabbir_whatsapp_finalize_outbound($1,$2)',[r.rows[0].id,provider])).rows[0];
}
function bookingState(){return understandConversation({context:context({batch_messages:[{body:'الثاني'}],pending_state:offered}),now:evalNow}).state;}
async function commit(state=bookingState(),expected=0){const l=await load();state.activity_contract_version=l.activity_profile.services[0].contract_version;return rpc('dabbir_semantic_commit_v2',[batch,lock,expected,l.message_revision,state,{action:'CREATE_BOOKING'}]);}
before(async()=>{await db.exec(fs.readFileSync(new URL('./fixtures/understanding/database.sql',import.meta.url),'utf8'));await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260908025920_dabbir_understanding_engine_v2.sql',import.meta.url),'utf8'));
 await db.exec(fs.readFileSync(new URL('./fixtures/understanding/activity-database.sql',import.meta.url),'utf8'));
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260908155841_dabbir_activity_intelligence_v1.sql',import.meta.url),'utf8'));
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260909085635_dabbir_activity_action_authority_v1.sql',import.meta.url),'utf8'));
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260909091257_dabbir_activity_configuration_visibility_v1.sql',import.meta.url),'utf8'));
 await db.exec(`alter table public.dabbir_message_batches add column dispatch_token uuid,add column channel_type text default 'whatsapp',add column attempt_count integer default 1,add column last_error text,add column next_attempt_at timestamptz,add column processed_at timestamptz,add column updated_at timestamptz default now();
 alter table public.dabbir_conversations add column updated_at timestamptz default now();
 alter table public.dabbir_handoffs add column id uuid default gen_random_uuid(),add column customer_id uuid,add column route_class text,add column reason text,add column metadata jsonb,add column created_at timestamptz default now(),add column priority integer,add column routing_strategy text,add column summary text,add column attempted_actions jsonb,add column unresolved_items jsonb;`);
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260908173803_dabbir_provider_retry_checkpoint_v1.sql',import.meta.url),'utf8'));
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260909121326_dabbir_cognitive_dialogue_state_v1.sql',import.meta.url),'utf8'));
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260909121923_dabbir_cognitive_rollout_deny_clients_v1.sql',import.meta.url),'utf8'));
 await db.exec('alter table public.dabbir_whatsapp_outbound_reservations add column provider_verified boolean not null default false');
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260909134020_dabbir_cognitive_delivery_progress_v1.sql',import.meta.url),'utf8'));
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260909142432_dabbir_service_presentation_receipts_v1.sql',import.meta.url),'utf8'));
 await db.exec(`alter table public.dabbir_whatsapp_outbound_reservations add column finalized_at timestamptz,add column provider_status text;
 alter table public.dabbir_messages add column intent text;
 alter table public.dabbir_whatsapp_event_ledger alter column id set default gen_random_uuid(),add column business_id uuid,add column connection_id uuid,add column event_key text,add column direction text,add column event_type text,add column provider_message_id text,add column conversation_id uuid,add column message_id uuid,add column provider_status text,add column provider_verified boolean,add column occurred_at timestamptz,add column evidence jsonb;`);
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260903105200_dabbir_whatsapp_ai_outbound_handoff_guard_v1.sql',import.meta.url),'utf8'));
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260909143719_dabbir_cognitive_finalized_acceptance_v1.sql',import.meta.url),'utf8'));
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260909144318_dabbir_atomic_cognitive_presentation_v1.sql',import.meta.url),'utf8'));
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260909144913_dabbir_cognitive_receipt_reconciliation_v1.sql',import.meta.url),'utf8'));
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260909180619_dabbir_conversational_brain_context_v1.sql',import.meta.url),'utf8'));
 await db.query('insert into auth.users(id) values($1),($2)',[owner,otherOwner]);
 await db.query('insert into dabbir_businesses(id) values($1),($2)',[ids.business,ids.other]);
 await db.query("insert into dabbir_memberships values($1,$2,'owner','active'),($3,$4,'owner','active')",[ids.business,owner,ids.other,otherOwner]);
 await db.query('insert into dabbir_customers(id,business_id) values($1,$2)',[ids.customer,ids.business]);
 await db.query('insert into dabbir_business_branches(id,business_id) values($1,$2)',[ids.branch,ids.business]);
 await db.query('insert into dabbir_conversations(id,business_id,customer_id,branch_id) values($1,$2,$3,$4)',[ids.conversation,ids.business,ids.customer,ids.branch]);
 await db.query('insert into dabbir_services(id,business_id) values($1,$2)',[ids.service,ids.business]);
 await db.query('insert into dabbir_workers(id,business_id) values($1,$2)',[ids.worker,ids.business]);
 await db.query('insert into dabbir_branch_services(business_id,branch_id,service_id) values($1,$2,$3)',[ids.business,ids.branch,ids.service]);
});after(()=>db.close());
test('cognitive SQL: rollout is scoped, defaults to shadow and is inaccessible to client roles',async()=>{
 await reset();assert.equal((await load()).cognitive_policy.mode,'shadow');
 await db.query("insert into dabbir_private.cognitive_rollouts(business_id,mode,canary_percent) values($1,'canary',100)",[ids.business]);
 assert.equal((await load()).cognitive_policy.mode,'canary');
 await db.query('delete from dabbir_private.cognitive_rollouts');
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from dabbir_private.cognitive_rollouts'),/permission denied/);await db.exec('reset role');
});
test('cognitive SQL: previous question presentation needs a same-batch provider receipt and current version',async()=>{
 await reset();const state=understandConversation({context:context({batch_messages:[{body:'أبي غسيل'}]}),now:evalNow}).state;
 await commit(state);const args=[batch,lock,1,'cognitive-receipt','date'];
 await assert.rejects(rpc('dabbir_cognitive_record_delivery_v1',args),/COGNITIVE_PRESENTATION_UNVERIFIED/);
 await finalizeReply('cognitive-receipt','clarify');
 assert.equal((await rpc('dabbir_cognitive_record_delivery_v1',args)).verified,true);
 const saved=(await load()).semantic_state.cognition;assert.equal(saved.pending_question.presentation,'PROVIDER_ACCEPTED');assert.equal(saved.pending_field,'date');
 await assert.rejects(rpc('dabbir_cognitive_record_delivery_v1',[batch,lock,0,'cognitive-receipt','date']),/SEMANTIC_VERSION_CONFLICT/);
 await db.exec('set role anon');await assert.rejects(rpc('dabbir_cognitive_record_delivery_v1',args),/permission denied/);await db.exec('reset role');
});
test('database: semantic state persists once per batch with audited provenance',async()=>{await reset();const s=bookingState();const c=await commit(s);assert.equal(c.version,1);const again=await commit(s);assert.equal(again.replay,true);assert.equal((await load()).version,1);assert.equal((await db.query('select count(*) n from dabbir_ai_understanding_events')).rows[0].n,1);});
test('database: next turn recovers an exact delivered menu without restoring superseded authority',async()=>{
 await reset();await commit();
 await rpc('dabbir_semantic_set_pending_v2',[batch,lock,1,'choose_service',{presented:false,services:[{id:ids.service,label:'Shown service'}],presentation_batch_id:'forged',presentation_branch_id:'forged'}]);
 const staged=(await db.query('select payload,expires_at::text as expires_at from dabbir_ai_conversation_state')).rows[0];
 assert.equal(staged.payload.presentation_batch_id,batch);assert.equal(staged.payload.presentation_branch_id,ids.branch);
 const next='90000000-0000-4000-8000-000000000004',nextMessage='90000000-0000-4000-8000-000000000005';
 await db.query('insert into dabbir_messages(id,business_id,conversation_id) values($1,$2,$3)',[nextMessage,ids.business,ids.conversation]);
 await db.query("update dabbir_message_batches set state='CANCELLED' where id=$1",[batch]);
 await db.query('insert into dabbir_message_batches(id,business_id,conversation_id,customer_id,lock_token) values($1,$2,$3,$4,$5)',[next,ids.business,ids.conversation,ids.customer,lock]);
 await db.query('insert into dabbir_message_batch_items(batch_id,business_id,message_id,ordinal) values($1,$2,$3,1)',[next,ids.business,nextMessage]);
 const nextLoad=()=>rpc('dabbir_semantic_load_v2',[next,lock]);
 assert.equal((await nextLoad()).verified_service_presentation,null);
 await db.query("insert into dabbir_whatsapp_outbound_reservations(business_id,conversation_id,idempotency_key,provider_message_id,state,provider_verified) values($1,$2,$3,'menu-receipt','READ',true)",[ids.business,ids.conversation,'wa-understanding:'+batch+':reply']);
 const verified=(await nextLoad()).verified_service_presentation;
 assert.equal(verified.payload.presented,true);assert.equal(verified.payload.provider_message_id,'menu-receipt');
 assert.deepEqual(verified.payload.services,staged.payload.services);
 assert.equal(Date.parse(verified.expires_at),Date.parse(staged.expires_at),'recovery cannot refresh stale offers');
 assert.equal((await db.query('select payload from dabbir_ai_conversation_state')).rows[0].payload.presented,false,'load only proves the old read result, without mutating it');
 await assert.rejects(rpc('dabbir_semantic_execute_v2',[batch,lock,1,'CREATE_BOOKING']),/SEMANTIC_BATCH_LOCK_INVALID|SEMANTIC_SUPERSEDED/);
 for(const [state,verified] of [['SENDING',true],['PROVIDER_ACCEPTED',true],['FAILED',true],['AMBIGUOUS',true],['DELIVERED',false],['READ',false]]){
  await db.query("update dabbir_whatsapp_outbound_reservations set state=$1,provider_verified=$2 where provider_message_id='menu-receipt'",[state,verified]);
  assert.equal((await nextLoad()).verified_service_presentation,null,state);
 }
 await db.query("update dabbir_whatsapp_outbound_reservations set state='SENT',provider_verified=false where provider_message_id='menu-receipt'");
 assert.equal((await nextLoad()).verified_service_presentation.payload.presented,true);
 await db.query('update dabbir_message_batches set customer_id=$1 where id=$2',[owner,batch]);assert.equal((await nextLoad()).verified_service_presentation,null);
 await db.query('update dabbir_message_batches set customer_id=$1 where id=$2',[ids.customer,batch]);
 await db.query("update dabbir_ai_conversation_state set payload=jsonb_set(payload,'{presentation_branch_id}',to_jsonb($1::text))",[ids.other]);assert.equal((await nextLoad()).verified_service_presentation,null);
 await db.query("update dabbir_ai_conversation_state set payload=jsonb_set(payload,'{presentation_branch_id}',to_jsonb($1::text))",[ids.branch]);
 for(const [column,value] of [['business_id',ids.other],['conversation_id',ids.other],['idempotency_key','wa-understanding:'+next+':reply']]){
  const prior=(await db.query(`select ${column} from dabbir_whatsapp_outbound_reservations where provider_message_id='menu-receipt'`)).rows[0][column];
  await db.query(`update dabbir_whatsapp_outbound_reservations set ${column}=$1 where provider_message_id='menu-receipt'`,[value]);
  assert.equal((await nextLoad()).verified_service_presentation,null,column);
  await db.query(`update dabbir_whatsapp_outbound_reservations set ${column}=$1 where provider_message_id='menu-receipt'`,[prior]);
 }
 await db.query("update dabbir_ai_conversation_state set pending_action='choose_slot'");assert.equal((await nextLoad()).verified_service_presentation,null);
 await db.query("update dabbir_ai_conversation_state set pending_action='choose_service',expires_at=now()-interval '1 second'");assert.equal((await nextLoad()).verified_service_presentation,null);
});

test('canonical finalization atomically certifies its own service menu even when interpretation was superseded',async()=>{
 await reset();await commit();
 await rpc('dabbir_semantic_set_pending_v2',[batch,lock,1,'choose_service',{presented:false,services:[{id:ids.service,label:'Shown service'}]}]);
 await db.query("update dabbir_message_batches set state='CANCELLED' where id=$1",[batch]);
 const receipt=await finalizeReply('atomic-menu-receipt','reply');
 const saved=(await db.query('select payload from dabbir_ai_conversation_state')).rows[0].payload;
 assert.equal(saved.presented,true);assert.equal(saved.provider_message_id,'atomic-menu-receipt');
 assert.equal(receipt.reservation_state,'PROVIDER_ACCEPTED');
 assert.equal((await db.query('select provider_verified from dabbir_whatsapp_event_ledger where id=$1',[receipt.event_id])).rows[0].provider_verified,false);
 await assert.rejects(rpc('dabbir_semantic_execute_v2',[batch,lock,1,'CREATE_BOOKING']),/SEMANTIC_BATCH_LOCK_INVALID|SEMANTIC_SUPERSEDED/);
});

test('canonical outbound finalization proves API acceptance immediately, without inventing delivery',async()=>{
 await reset();await commit();
 const reservation=(await db.query("insert into dabbir_whatsapp_outbound_reservations(business_id,conversation_id,idempotency_key,sender_type,body,state) values($1,$2,$3,'ai','Which service?','SENDING') returning id",[ids.business,ids.conversation,'wa-understanding:'+batch+':clarify'])).rows[0].id;
 const args=[batch,lock,1,'api-acceptance-receipt','service_question_target'];
 await assert.rejects(rpc('dabbir_cognitive_record_delivery_v1',args),/COGNITIVE_PRESENTATION_UNVERIFIED/);
 const receipt=(await db.query('select * from public.dabbir_whatsapp_finalize_outbound($1,$2)',[reservation,'api-acceptance-receipt'])).rows[0];
 assert.equal(receipt.reservation_state,'PROVIDER_ACCEPTED');assert.ok(receipt.message_id);assert.ok(receipt.event_id);
 assert.equal((await rpc('dabbir_cognitive_record_delivery_v1',args)).verified,true);
 const outbound=(await db.query('select * from dabbir_whatsapp_outbound_reservations where id=$1',[reservation])).rows[0];
 assert.equal(outbound.provider_verified,false);assert.equal(outbound.state,'PROVIDER_ACCEPTED');
 assert.equal((await load()).semantic_state.cognition.pending_question.presentation,'PROVIDER_ACCEPTED');
 const event=(await db.query('select * from dabbir_whatsapp_event_ledger where id=$1',[receipt.event_id])).rows[0];
 for(const [column,invalid] of [['business_id',ids.other],['conversation_id',ids.other],['connection_id',ids.other],['provider_message_id','unrelated'],['event_key','outbound:unrelated'],['direction','inbound'],['message_id',message],['evidence',{source:'meta_messages_api',provider_accepted:true,reservation_id:ids.other}]]){
  await db.query(`update dabbir_whatsapp_event_ledger set ${column}=$1 where id=$2`,[invalid,receipt.event_id]);
  await assert.rejects(rpc('dabbir_cognitive_record_delivery_v1',args),/COGNITIVE_PRESENTATION_UNVERIFIED/,column);
  await db.query(`update dabbir_whatsapp_event_ledger set ${column}=$1 where id=$2`,[event[column],receipt.event_id]);
 }
 await db.query('update dabbir_messages set simulated=true where id=$1',[receipt.message_id]);
 await assert.rejects(rpc('dabbir_cognitive_record_delivery_v1',args),/COGNITIVE_PRESENTATION_UNVERIFIED/);
 await db.query('update dabbir_messages set simulated=false where id=$1',[receipt.message_id]);
 await db.query('update dabbir_whatsapp_outbound_reservations set finalized_at=null where id=$1',[reservation]);
 await assert.rejects(rpc('dabbir_cognitive_record_delivery_v1',args),/COGNITIVE_PRESENTATION_UNVERIFIED/);
 await db.exec('set role authenticated');
 await assert.rejects(db.query('select dabbir_private.understanding_outbound_receipt_verified_v1($1)',[reservation]),/permission denied/);
 await db.exec('reset role');
});
test('live receipt regression: verified DELIVERED/READ advances presentation while unsafe states stay denied',async()=>{
 await reset();await commit(understandConversation({context:context({batch_messages:[{body:'أبي غسيل'}]}),now:evalNow}).state);
 await db.query("insert into dabbir_whatsapp_outbound_reservations(business_id,conversation_id,idempotency_key,provider_message_id,state) values($1,$2,$3,'progress-receipt','SENDING')",[ids.business,ids.conversation,'wa-understanding:'+batch+':clarify']);
 const args=[batch,lock,1,'progress-receipt','vehicle'];
 for(const [state,verified] of [['SENDING',true],['PROVIDER_ACCEPTED',true],['FAILED',true],['AMBIGUOUS',true],['DELIVERED',false],['READ',false]]){
  await db.query("update dabbir_whatsapp_outbound_reservations set state=$1,provider_verified=$2 where provider_message_id='progress-receipt'",[state,verified]);
  await assert.rejects(rpc('dabbir_cognitive_record_delivery_v1',args),/COGNITIVE_PRESENTATION_UNVERIFIED/);
 }
 await db.query("update dabbir_whatsapp_outbound_reservations set state='SENDING' where provider_message_id='progress-receipt'");
 await db.query("select * from public.dabbir_whatsapp_finalize_outbound((select id from dabbir_whatsapp_outbound_reservations where provider_message_id='progress-receipt'),'progress-receipt')");
 for(const state of ['SENT','DELIVERED','READ']){
  await db.query("update dabbir_whatsapp_outbound_reservations set state=$1,provider_verified=$2 where provider_message_id='progress-receipt'",[state,state!=='SENT']);
  assert.equal((await rpc('dabbir_cognitive_record_delivery_v1',args)).verified,true);
 }
 assert.equal((await db.query("select count(*) n from dabbir_ai_understanding_events where event_type='COGNITIVE_PRESENTED'")).rows[0].n,1);
 await db.query("update dabbir_whatsapp_outbound_reservations set idempotency_key='wa-understanding:another-batch:clarify' where provider_message_id='progress-receipt'");
 await assert.rejects(rpc('dabbir_cognitive_record_delivery_v1',args),/COGNITIVE_PRESENTATION_UNVERIFIED/);
});
test('database: queued goal persists through real SQL execution and only resumes after verified delivery',async()=>{
 await reset();const s=bookingState();const stamp=new Date();s.updated_at=stamp.toISOString();s.expires_at=new Date(stamp.getTime()+86400000).toISOString();
 const queued=understandConversation({context:context({batch_messages:[{body:'أبي أحجز غسيل كامل بكره الساعة 6 م'}]}),now:stamp}).state;
 s.goal_queue=[{version:1,id:'queued-job-1',state:queued}];s.goal_queue_seen=['queued-job-1'];s.goal_queue_version=1;
 await commit(s);await rpc('dabbir_semantic_set_pending_v2',[batch,lock,1,'choose_slot',offered.payload]);
 const action=await rpc('dabbir_semantic_execute_v2',[batch,lock,1,'CREATE_BOOKING']);assert.equal(action.verified,true);
 const before=(await load()).semantic_state;assert.equal(before.goal_queue.length,1);assert.equal(resumeQueuedGoal(before,context(),new Date()).blocked,true);
 await finalizeReply('queue-completion','create_booking');
 await rpc('dabbir_cognitive_record_delivery_v1',[batch,lock,1,'queue-completion',null]);
 const after=(await load()).semantic_state;const next=resumeQueuedGoal(after,context(),new Date());assert.equal(next.resumed,true);assert.equal(next.previous.entities.time.value,'18:00');assert.equal(next.previous.entities.slot,undefined);assert.equal(next.previous.goal_queue.length,0);
 assert.equal((await db.query('select count(*) n from dabbir_appointments')).rows[0].n,1);assert.equal((await db.query('select octet_length(semantic_state::text) n from dabbir_ai_conversation_state')).rows[0].n<=32768,true);
});
test('database: cross-tenant state and mismatched customer are rejected',async()=>{await reset();const s=bookingState();s.scope.business_id=ids.other;await assert.rejects(commit(s),/SEMANTIC_STATE_SCOPE_INVALID/);s.scope.business_id=ids.business;s.scope.customer_id=owner;await assert.rejects(commit(s),/SEMANTIC_STATE_SCOPE_INVALID/);});
test('database: compound conversation foreign key rejects cross-business insert',async()=>{await reset();await assert.rejects(db.query('insert into dabbir_ai_conversation_state(business_id,conversation_id) values($1,$2)',[ids.other,ids.conversation]),/foreign key/);});
test('database: stale worker cannot commit after a new inbound at equal timestamp',async()=>{await reset();const l=await load();await db.query('insert into dabbir_messages(business_id,conversation_id,created_at) select business_id,conversation_id,created_at from dabbir_messages where id=$1',[message]);await assert.rejects(rpc('dabbir_semantic_commit_v2',[batch,lock,0,l.message_revision,bookingState(),{}]),/SEMANTIC_SUPERSEDED/);});
test('database: new message between commit and mutation blocks the old intent',async()=>{await reset();await commit();await db.query('insert into dabbir_messages(business_id,conversation_id)values($1,$2)',[ids.business,ids.conversation]);await assert.rejects(rpc('dabbir_semantic_execute_v2',[batch,lock,1,'CREATE_BOOKING']),/SEMANTIC_SUPERSEDED/);assert.equal((await db.query('select count(*) n from dabbir_appointments')).rows[0].n,0);});
test('database: expired lock and wrong lock token fail closed',async()=>{await reset();await assert.rejects(rpc('dabbir_semantic_load_v2',[batch,message]),/SEMANTIC_BATCH_LOCK_INVALID/);await db.query("update dabbir_message_batches set locked_until=now()-interval '1 minute'");await assert.rejects(load(),/SEMANTIC_BATCH_LOCK_INVALID/);});
test('database: human takeover blocks state and mutations',async()=>{await reset();await commit();await db.query("update dabbir_conversations set state='human_active'");await assert.rejects(rpc('dabbir_semantic_execute_v2',[batch,lock,1,'CREATE_BOOKING']),/AI_BLOCKED_BY_HUMAN_TAKEOVER/);});
test('database: incomplete or low confidence state cannot mutate',async()=>{await reset();let s=bookingState();s.missing_fields=['location'];await commit(s);await assert.rejects(rpc('dabbir_semantic_execute_v2',[batch,lock,1,'CREATE_BOOKING']),/SEMANTIC_MUTATION_BLOCKED/);await reset();s=bookingState();s.operational_confidence=.5;await commit(s);await assert.rejects(rpc('dabbir_semantic_execute_v2',[batch,lock,1,'CREATE_BOOKING']),/SEMANTIC_MUTATION_BLOCKED/);});
test('database: inferred or fabricated slot cannot create an appointment',async()=>{await reset();const s=bookingState();s.entities.slot.source='AI_INFERENCE';await commit(s);await rpc('dabbir_semantic_set_pending_v2',[batch,lock,1,'choose_slot',offered.payload]);await assert.rejects(rpc('dabbir_semantic_execute_v2',[batch,lock,1,'CREATE_BOOKING']),/SEMANTIC_SLOT_UNCONFIRMED/);});
test('database: guarded booking readback, safe memory and idempotent retry',async()=>{await reset();await commit();await rpc('dabbir_semantic_set_pending_v2',[batch,lock,1,'choose_slot',offered.payload]);const r=await rpc('dabbir_semantic_execute_v2',[batch,lock,1,'CREATE_BOOKING']);assert.equal(r.verified,true);const repeated=await rpc('dabbir_semantic_execute_v2',[batch,lock,1,'CREATE_BOOKING']);assert.equal(repeated.idempotent_replay,true);assert.equal(repeated.appointment_id,r.appointment_id);assert.equal((await db.query('select count(*) n from dabbir_appointments')).rows[0].n,1);const m=(await load()).verified_memory;assert.equal(m.length,1);assert.equal(m[0].status,'verified');assert.equal(m[0].value.id,ids.service);});
test('database: PUBLIC and anonymous roles cannot execute V2 operational RPCs',async()=>{await reset();const rows=(await db.query("select proname,has_function_privilege('anon',p.oid,'EXECUTE') a,has_function_privilege('authenticated',p.oid,'EXECUTE') u from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like 'dabbir_semantic_%'")).rows;assert.ok(rows.length>=5);for(const r of rows){assert.equal(r.a,false,r.proname);assert.equal(r.u,false,r.proname);}await db.exec('set role anon');await assert.rejects(load(),/permission denied/);await db.exec('reset role');});
test('database: owner proposal is inactive until explicit approval, then revoke and rollback are audited',async()=>{await reset();await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[owner]);await db.exec('set role authenticated');const p=await rpc('dabbir_knowledge_propose_v2',[ids.business,ids.conversation,null,'service','VIP',ids.service]);assert.equal(p.active,false);const approved=await rpc('dabbir_knowledge_review_v2',[ids.business,p.id,'approve']);assert.equal(approved.active,true);await rpc('dabbir_knowledge_review_v2',[ids.business,p.id,'revoke']);const rolled=await rpc('dabbir_knowledge_review_v2',[ids.business,p.id,'rollback']);assert.equal(rolled.active,true);assert.ok(rolled.version>approved.version);const audit=await db.query('select event_type from dabbir_ai_understanding_events where proposal_id=$1',[p.id]);assert.deepEqual(new Set(audit.rows.map(r=>r.event_type)),new Set(['PROPOSED','OWNER_APPROVED','REVOKED','ROLLBACK']));await db.exec('reset role');});
test('database: cross-tenant owner cannot read proposals or approve another tenant',async()=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[otherOwner]);await db.exec('set role authenticated');assert.equal((await db.query('select * from dabbir_ai_knowledge_proposals where business_id=$1',[ids.business])).rows.length,0);await assert.rejects(rpc('dabbir_knowledge_review_v2',[ids.business,message,'approve']),/OWNER_REQUIRED/);await assert.rejects(rpc('dabbir_knowledge_propose_v2',[ids.other,null,null,'service','VIP',ids.service]),/KNOWLEDGE_TARGET_SCOPE_INVALID/);await db.exec('reset role');});
test('database: anonymous role cannot read proposal or event tables',async()=>{await db.exec('set role anon');await assert.rejects(db.query('select * from dabbir_ai_knowledge_proposals'),/permission denied/);await assert.rejects(db.query('select * from dabbir_ai_understanding_events'),/permission denied/);await db.exec('reset role');});

async function configureActivity(config={},action='SAVE',restore=null){
 await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[owner]);
 await db.exec('set role authenticated');
 const rows=await db.query('select coalesce(max(version),0)::int version from dabbir_activity_service_versions where business_id=$1 and branch_id=$2 and service_id=$3',[ids.business,ids.branch,ids.service]);
 const r=await rpc('dabbir_activity_service_configure_v1',[ids.business,ids.branch,ids.service,rows.rows[0].version,config,action,restore]);
 await db.exec('reset role');await db.query("select set_config('request.jwt.claim.role','service_role',false)");return r;
}
async function activityBooking(config={},facts={},modify=null){
 await reset();await configureActivity(config);
 const l=await load(),c=context({activity_profile:l.activity_profile,verified_memory:l.verified_memory,location_receipts:l.location_receipts,batch_messages:[{body:'الثاني'}],pending_state:{...offered,payload:{...offered.payload,activity_contract_version:l.activity_profile.services[0].contract_version}}});
 let state=understandConversation({context:c,now:evalNow}).state;
 state.entities={...state.entities,...facts};
 // In these database fault-injection tests the adversarial caller may lie about
 // completeness; the actual SQL must independently recompute every requirement.
 state.delivery_mode=config.delivery_modes?.[0]||'AT_BUSINESS';
 state.entities.delivery_mode={value:state.delivery_mode,source:'DATABASE_FACT',status:'active',confidence:1,service_id:ids.service};
 state.activity_contract_version=l.activity_profile.services[0].contract_version;
 state.pending_action='CREATE_BOOKING';state.operational_confidence=1;state.missing_fields=[];state.unresolved_references=[];
 if(modify)modify(state);
 await commit(state);await rpc('dabbir_semantic_set_pending_v2',[batch,lock,1,'choose_slot',offered.payload]);
 return state;
}
const validVehicle={value:'station',source:'CUSTOMER_STATED',status:'active',confidence:1};
const validLocation={value:{lat:24.453884,lng:54.377343,label:'test'},source:'PROVIDER_VERIFIED',status:'active',confidence:1,receipt_id:message};
const executeActivity=()=>rpc('dabbir_semantic_execute_v2',[batch,lock,1,'CREATE_BOOKING']);
const receipt=()=>db.query('insert into dabbir_whatsapp_location_receipts(message_id,business_id,conversation_id,latitude,longitude) values($1,$2,$3,$4,$5)',[message,ids.business,ids.conversation,validLocation.value.lat,validLocation.value.lng]);

test('activity SQL: defaults, service overrides, revocation and rollback have distinct audited versions',async()=>{
 await reset();const configured=await configureActivity({activity_type:'car_wash',delivery_modes:['AT_BUSINESS']});
 assert.equal(configured.contract.activity_type,'car_wash');assert.deepEqual(configured.contract.mode_requirements.AT_BUSINESS.required,[]);
 const revoked=await configureActivity({},'REVOKE');assert.equal(revoked.contract.activity_type,'services');
 const rolled=await configureActivity({},'ROLLBACK',configured.version);assert.equal(rolled.contract.activity_type,'car_wash');assert.ok(rolled.version>revoked.version);
 const rows=(await db.query('select action from dabbir_activity_service_versions order by version')).rows;assert.ok(rows.some(r=>r.action==='REVOKE'));assert.ok(rows.some(r=>r.action==='ROLLBACK'));
});
test('activity SQL: profile exposes scoped ontology, requirements and configured resource truth',async()=>{
 await reset();await configureActivity({activity_type:'car_wash',activity_instance_id:'mobile_wash',delivery_modes:['MOBILE'],service_area:{type:'CIRCLE',center:{lat:24.4,lng:54.3},radius_km:10}});
 const p=(await load()).activity_profile;
 assert.deepEqual(p.delivery_modes,['MOBILE']);assert.equal(p.activity_instances[0].id,'mobile_wash');
 assert.equal(p.services[0].ontology.vehicle,'vehicle');assert.equal(p.services[0].ontology.booking,'appointment');
 assert.deepEqual(new Set(p.required_customer_facts[0].fields),new Set(['service','date','time','vehicle','location']));
 assert.equal(p.service_areas[0].branch_id,ids.branch);assert.equal(p.service_areas[0].service_id,ids.service);
 assert.deepEqual(p.teams,[]);assert.deepEqual(p.assets,[]);assert.equal(p.resource_configuration.teams,'NOT_CONFIGURED');
 assert.equal(p.operational_constraints.inference_mutation_allowed,false);assert.equal(p.owner_policies[0].version,p.services[0].owner_version);
});
test('activity SQL: owner cannot disable platform safety or save unknown requirements',async()=>{
 for(const config of [{optional_entities:['location']},{required_entities:['diagnosis']},{delivery_modes:['HYBRID']},{disable_tenant_check:true},{service_area:{type:'CIRCLE',center:{lat:91,lng:54},radius_km:5}}])await assert.rejects(configureActivity(config),/ACTIVITY_/);
 await db.exec('reset role');
});
test('activity SQL: owner configuration uses compare-and-swap and cannot rewrite audit rows',async()=>{
 await configureActivity({delivery_modes:['REMOTE']});await db.query("select set_config('request.jwt.claim.role','authenticated',false)");await db.exec('set role authenticated');
 await assert.rejects(rpc('dabbir_activity_service_configure_v1',[ids.business,ids.branch,ids.service,0,{},'SAVE',null]),/VERSION_CONFLICT/);
 await assert.rejects(db.query('update dabbir_activity_service_versions set config=$1',[{}]),/permission denied/);await db.exec('reset role');
});
test('activity SQL: foreign owner and anonymous role cannot read or mutate another branch profile',async()=>{
 await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[otherOwner]);await db.exec('set role authenticated');
 assert.equal((await db.query('select * from dabbir_activity_service_versions where business_id=$1',[ids.business])).rows.length,0);
 await assert.rejects(rpc('dabbir_activity_profile_v1',[ids.business,ids.branch]),/OWNER_REQUIRED/);
 await assert.rejects(rpc('dabbir_activity_service_configure_v1',[ids.business,ids.branch,ids.service,0,{},'SAVE',null]),/OWNER_REQUIRED/);
 await db.exec('reset role');await db.exec('set role anon');await assert.rejects(db.query('select * from dabbir_whatsapp_location_receipts'),/permission denied/);await db.exec('reset role');
});
for(const type of ['car_wash','salon','consulting','clinic'])test('activity SQL: '+type+' at branch or remote creates without customer location',async()=>{
 await activityBooking({activity_type:type,delivery_modes:[type==='consulting'?'REMOTE':'AT_BUSINESS']});
 const r=await executeActivity();assert.equal(r.verified,true);
 const row=(await db.query('select service_latitude,activity_intelligence from dabbir_appointments where id=$1',[r.appointment_id])).rows[0];assert.equal(row.service_latitude,null);assert.equal(row.activity_intelligence.activity_type,type);
});
test('activity SQL: MOBILE rejects missing vehicle even if JS claims no fields are missing',async()=>{
 await activityBooking({activity_type:'car_wash',delivery_modes:['MOBILE']},{location:validLocation});await receipt();await assert.rejects(executeActivity(),/ACTIVITY_REQUIRED_FACT_UNVERIFIED:vehicle/);assert.equal((await db.query('select count(*)::int n from dabbir_appointments')).rows[0].n,0);
});
test('activity SQL: MOBILE rejects a typed, forged or inferred location',async()=>{
 for(const location of [{...validLocation,receipt_id:null},{...validLocation,source:'AI_INFERENCE'},{...validLocation,value:{lat:91,lng:54}}]){
  await activityBooking({activity_type:'car_wash',delivery_modes:['MOBILE']},{vehicle:validVehicle,location});await receipt();await assert.rejects(executeActivity(),/ACTIVITY_(REQUIRED_FACT_UNVERIFIED|LOCATION)/);
 }
});
test('activity SQL: verified GPS persists atomically with booking and safe structured memory',async()=>{
 await activityBooking({activity_type:'car_wash',delivery_modes:['MOBILE']},{vehicle:validVehicle,location:validLocation});await receipt();const r=await executeActivity();
 const row=(await db.query('select service_latitude,service_longitude,location_type,activity_intelligence from dabbir_appointments where id=$1',[r.appointment_id])).rows[0];
 assert.equal(row.service_latitude,validLocation.value.lat);assert.equal(row.service_longitude,validLocation.value.lng);assert.equal(row.location_type,'customer');assert.equal(row.activity_intelligence.vehicle,'station');
 const m=(await load()).verified_memory.find(x=>x.memory_key==='last_verified_location');assert.equal(m.branch_id,ids.branch);assert.equal(m.value.value.lat,validLocation.value.lat);assert.ok(m.id);assert.ok(m.expires_at);
});
test('activity SQL: HOME CLEANING rejects missing property details and never inherits vehicle requirements',async()=>{
 await activityBooking({activity_type:'home_cleaning',delivery_modes:['AT_CUSTOMER']},{location:validLocation});await receipt();await assert.rejects(executeActivity(),/ACTIVITY_REQUIRED_FACT_UNVERIFIED:property_details/);
 await activityBooking({activity_type:'home_cleaning',delivery_modes:['AT_CUSTOMER']},{location:validLocation,property_details:{value:'فيلا 3 غرف',status:'active',source:'CUSTOMER_STATED',confidence:1}});await receipt();assert.equal((await executeActivity()).verified,true);
});
test('activity SQL: a revoked or changed service config invalidates the earlier semantic decision',async()=>{
 await activityBooking({delivery_modes:['AT_BUSINESS']});await configureActivity({delivery_modes:['REMOTE']});await assert.rejects(executeActivity(),/ACTIVITY_CONTRACT_STALE/);
});
test('activity SQL: outside service area and owner approval prevent mutations',async()=>{
 await activityBooking({activity_type:'car_wash',delivery_modes:['MOBILE'],service_area:{type:'CIRCLE',center:{lat:25.2,lng:55.3},radius_km:5}},{vehicle:validVehicle,location:validLocation});await receipt();await assert.rejects(executeActivity(),/ACTIVITY_OUTSIDE_SERVICE_AREA/);
 await activityBooking({delivery_modes:['AT_BUSINESS'],owner_approval:true});await assert.rejects(executeActivity(),/ACTIVITY_OWNER_APPROVAL_REQUIRED/);
});
test('activity SQL: old or foreign memory cannot silently authorize a location',async()=>{
 await activityBooking({activity_type:'car_wash',delivery_modes:['MOBILE']},{vehicle:validVehicle,location:{...validLocation,source:'CUSTOMER_MEMORY',memory_id:'a0000000-0000-4000-8000-000000000001',memory_version:1}});await assert.rejects(executeActivity(),/ACTIVITY_MEMORY_STALE/);
});
test('activity SQL: direct WhatsApp insert without current semantic authority fails at the table',async()=>{
 await reset();await assert.rejects(db.query('insert into dabbir_appointments(business_id,branch_id,customer_id,service_id,starts_at)values($1,$2,$3,$4,now())',[ids.business,ids.branch,ids.customer,ids.service]),/ACTIVITY_GROUNDED_CONTEXT_REQUIRED/);
});
test('activity SQL: provider presentation receipt and branch catalog remain final DB requirements',async()=>{
 await activityBooking({delivery_modes:['AT_BUSINESS']});await db.exec('delete from dabbir_whatsapp_outbound_reservations');await assert.rejects(executeActivity(),/ACTIVITY_SLOT_UNVERIFIED/);
 await activityBooking({delivery_modes:['AT_BUSINESS']});await db.exec('update dabbir_branch_services set active=false');await assert.rejects(executeActivity(),/ACTIVITY_SERVICE_SCOPE_INVALID/);await db.exec('update dabbir_branch_services set active=true');
});

const failover=()=>rpc('dabbir_whatsapp_ai_provider_failover',[lock,'AI_PLANNER_UNAVAILABLE']);
async function retryBatch(attempt=1){await reset();await db.query("update dabbir_message_batches set state='RETRY',dispatch_token=$1,attempt_count=$2,last_error='AI_PLANNER_UNAVAILABLE',next_attempt_at=now()+interval '20 seconds'",[lock,attempt]);}
test('incident regression DB: first provider failure remains retryable with no handoff',async()=>{await retryBatch();const r=await failover();assert.equal(r.state,'RETRY');assert.equal(r.handled,false);assert.equal((await db.query('select count(*) n from dabbir_handoffs')).rows[0].n,0);assert.equal((await db.query('select state from dabbir_message_batches')).rows[0].state,'RETRY');assert.deepEqual((await db.query('select * from dabbir_whatsapp_ai_provider_failover_candidates(12)')).rows,[]);});
test('incident regression DB: second failure hands off once and is not a customer request',async()=>{await retryBatch(2);const r=await failover();assert.equal(r.handled,true);await failover();const rows=(await db.query('select reason,metadata from dabbir_handoffs')).rows;assert.equal(rows.length,1);assert.equal(rows[0].reason,'AI_PROVIDER_FAILED_TWICE');assert.equal(rows[0].metadata.customer_requested_human,false);});
test('incident regression DB: newer message cancels failover without a handoff',async()=>{await retryBatch(2);await db.query("insert into dabbir_messages(business_id,conversation_id,created_at) values($1,$2,now()+interval '1 minute')",[ids.business,ids.conversation]);assert.equal((await failover()).state,'SUPERSEDED');assert.equal((await db.query('select count(*) n from dabbir_handoffs')).rows[0].n,0);});
test('incident regression DB: human ownership excludes both fast and cron failover',async()=>{await retryBatch(2);await db.query("update dabbir_conversations set state='human_active'");assert.equal((await failover()).state,'HUMAN_OWNED');assert.deepEqual((await db.query('select * from dabbir_whatsapp_ai_provider_failover_candidates(12)')).rows,[]);});
test('incident regression DB: mismatched customer cannot authorize failover',async()=>{await retryBatch(2);await db.query('update dabbir_message_batches set customer_id=$1',[owner]);assert.equal((await failover()).state,'SCOPE_INVALID');});
async function checkpoint(){const l=await load();return rpc('dabbir_semantic_checkpoint_failure_v1',[batch,lock,l.version,l.message_revision,bookingState(),'AI_PLANNER_UNAVAILABLE']);}
test('incident regression DB: failure checkpoint preserves facts but grants no execution authority',async()=>{await reset();const result=await checkpoint();assert.equal(result.executable,false);const l=await load();assert.equal(l.semantic_state.entities.service.value,ids.service);assert.equal(l.semantic_state.entities.slot,undefined);assert.equal(l.semantic_state.recovery_required,true);assert.equal(l.semantic_state.operational_confidence,0);await assert.rejects(rpc('dabbir_semantic_execute_v2',[batch,lock,result.version,'CREATE_BOOKING']));assert.equal((await db.query('select count(*) n from dabbir_appointments')).rows[0].n,0);const c=await commit(bookingState(),result.version);assert.equal(c.replay,false);assert.equal(c.version,result.version+1);});
test('incident regression DB: checkpoint cannot replace a committed decision',async()=>{await reset();await commit();await assert.rejects(checkpoint(),/SEMANTIC_DECISION_ALREADY_COMMITTED/);});
test('incident regression DB: checkpoint rejects superseded and human-owned turns',async()=>{await reset();await db.query("update dabbir_conversations set state='action_required'");await assert.rejects(checkpoint(),/AI_BLOCKED_BY_HUMAN_TAKEOVER/);await reset();const l=await load();await db.query('insert into dabbir_messages(business_id,conversation_id) values($1,$2)',[ids.business,ids.conversation]);await assert.rejects(rpc('dabbir_semantic_checkpoint_failure_v1',[batch,lock,l.version,l.message_revision,bookingState(),'AI_PLANNER_UNAVAILABLE']),/SEMANTIC_SUPERSEDED/);});
test('incident regression DB: failover and checkpoints are inaccessible to authenticated clients',async()=>{await reset();await db.exec('set role authenticated');await assert.rejects(failover(),/permission denied/);await assert.rejects(rpc('dabbir_semantic_checkpoint_failure_v1',[batch,lock,0,0,{},'AI_PLANNER_UNAVAILABLE']),/permission denied/);await db.exec('reset role');});


test('database: registry action restriction blocks the canonical executor and rolls back writes',async()=>{
 await activityBooking({delivery_modes:['AT_BUSINESS']});
 const before=(await db.query('select schema from dabbir_private.activity_registry_v1 where version=1')).rows[0].schema;
 try {
  await db.query("update dabbir_private.activity_registry_v1 set schema=jsonb_set(schema,'{activities,services,supported_actions}',$1::jsonb) where version=1",[JSON.stringify(['CHECK_AVAILABILITY','HANDOFF'])]);
  await assert.rejects(executeActivity(),/ACTIVITY_ACTION_NOT_SUPPORTED/);
  assert.equal((await db.query('select count(*)::int n from dabbir_appointments')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from dabbir_ai_action_ledger')).rows[0].n,0);
 } finally {await db.query('update dabbir_private.activity_registry_v1 set schema=$1 where version=1',[before]);}
});
test('database: unknown activity does not inherit generic booking permission',async()=>{
 await reset();await configureActivity({});
 await db.query("update dabbir_businesses set business_type='unconfigured_activity' where id=$1",[ids.business]);
 try {
  const service=(await load()).activity_profile.services[0];
  assert.equal(service.service_id,ids.service);assert.equal(service.configuration_status,'UNCONFIGURED');
  assert.equal(service.contract_version,null);assert.deepEqual(service.supported_actions,[]);assert.equal(service.automatic_booking,false);
  await assert.rejects(db.query('select dabbir_private.activity_contract_v1($1,$2,$3)',[ids.business,ids.branch,ids.service]),/ACTIVITY_TYPE_UNCONFIGURED/);
 }
 finally {await db.query("update dabbir_businesses set business_type='services' where id=$1",[ids.business]);}
});
test('database: existing home-visit setting reaches the contract while service overrides remain authoritative',async()=>{
 await reset();await configureActivity({});
 const initial=(await load()).activity_profile.services[0];
 try {
  await db.query('insert into public.dabbir_home_service_settings(business_id,enabled) values($1,true)',[ids.business]);
  const enabled=(await load()).activity_profile.services[0];
  assert.deepEqual(new Set(enabled.delivery_modes),new Set(['AT_BUSINESS','AT_CUSTOMER']));
  assert.notEqual(enabled.contract_version,initial.contract_version);
  await configureActivity({delivery_modes:['AT_BUSINESS']});
  assert.deepEqual((await load()).activity_profile.services[0].delivery_modes,['AT_BUSINESS']);
 } finally {await db.query('delete from public.dabbir_home_service_settings where business_id=$1',[ids.business]);await configureActivity({});}
});
test('database: an activity composed from existing capabilities can be added through registry data',async()=>{
 await reset();
 const before=(await db.query('select schema from dabbir_private.activity_registry_v1 where version=1')).rows[0].schema;
 try {
  await db.query("update dabbir_private.activity_registry_v1 set schema=jsonb_set(schema,'{activities,equipment_visit}',schema#>'{activities,services}') where version=1");
  await configureActivity({activity_type:'equipment_visit',delivery_modes:['REMOTE']});
  const loaded=await load();
  assert.equal(loaded.activity_profile.services[0].activity_type,'equipment_visit');
  assert.deepEqual(loaded.activity_profile.services[0].delivery_modes,['REMOTE']);
  assert.equal(loaded.activity_profile.services[0].supported_actions.includes('CREATE_BOOKING'),true);
  await activityBooking({activity_type:'equipment_visit',delivery_modes:['REMOTE']});
  const result=await executeActivity();assert.equal(result.verified,true);
  const saved=(await db.query('select activity_intelligence from dabbir_appointments where id=$1',[result.appointment_id])).rows[0];
  assert.equal(saved.activity_intelligence.activity_type,'equipment_visit');
 } finally {await db.query('update dabbir_private.activity_registry_v1 set schema=$1 where version=1',[before]);await configureActivity({});}
});

test('database: an owner can configure and revoke an unregistered business service without granting generic execution',async()=>{
 await reset();await configureActivity({});
 await db.query("update dabbir_businesses set business_type='store' where id=$1",[ids.business]);
 try {
  const missing=(await load()).activity_profile.services[0];assert.equal(missing.configuration_status,'UNCONFIGURED');
  await configureActivity({activity_type:'consulting',delivery_modes:['REMOTE']});
  assert.equal((await load()).activity_profile.services[0].activity_type,'consulting');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[owner]);await db.exec('set role authenticated');
  const current=(await rpc('dabbir_activity_profile_v1',[ids.business,ids.branch])).services[0];
  const revoked=await rpc('dabbir_activity_service_configure_v1',[ids.business,ids.branch,ids.service,current.owner_version,{},'REVOKE',null]);
  assert.equal(revoked.contract.configuration_status,'UNCONFIGURED');assert.deepEqual(revoked.contract.supported_actions,[]);
  const visible=await rpc('dabbir_activity_profile_v1',[ids.business,ids.branch]);assert.equal(visible.services[0].service_id,ids.service);
  await db.exec('reset role');
  await assert.rejects(db.query('select dabbir_private.activity_assert_action_v1($1,$2,$3,$4)',[ids.business,ids.branch,ids.service,'CREATE_BOOKING']),/ACTIVITY_TYPE_UNCONFIGURED/);
  assert.equal((await db.query('select count(*)::int n from dabbir_appointments')).rows[0].n,0);
 } finally {await db.exec('reset role');await db.query("update dabbir_businesses set business_type='services' where id=$1",[ids.business]);await configureActivity({});}
});

test('brain SQL: operational history is completed, recent, real and scoped to customer and branch',async()=>{
 await reset();
 await db.query("insert into dabbir_appointments(business_id,branch_id,customer_id,service_id,starts_at,status,booking_source) values($1,$2,$3,$4,now()-interval '1 day','completed','internal')",[ids.business,ids.branch,ids.customer,ids.service]);
 const valid=(await load()).operational_history;
 assert.equal(valid.length,1);assert.equal(valid[0].service_id,ids.service);assert.equal(valid[0].customer_id,ids.customer);
 for(const [column,bad] of [['business_id',ids.other],['branch_id',ids.other],['customer_id',ids.other],['status','cancelled'],['simulated',true],['starts_at','2020-01-01T00:00:00Z']]){
  const original=valid[0][column];
  await db.query(`update dabbir_appointments set ${column}=$1`,[bad]);
  assert.equal((await load()).operational_history.length,0,column);
  await db.query(`update dabbir_appointments set ${column}=$1`,[original]);
 }
});

test('brain SQL: historical selection is rechecked before a real mutation transaction',async()=>{
 await activityBooking();
 const history=(await db.query("insert into dabbir_appointments(business_id,branch_id,customer_id,service_id,starts_at,status,booking_source) values($1,$2,$3,$4,now()-interval '1 day','completed','internal') returning id",[ids.business,ids.branch,ids.customer,ids.service])).rows[0].id;
 await db.query("update dabbir_ai_conversation_state set semantic_state=jsonb_set(semantic_state,'{entities,service,historical_appointment_id}',to_jsonb($1::text))",[history]);
 await db.query("update dabbir_appointments set status='cancelled' where id=$1",[history]);
 await assert.rejects(executeActivity(),/ACTIVITY_HISTORICAL_REFERENCE_STALE/);
 assert.equal((await db.query('select count(*)::int n from dabbir_ai_action_ledger')).rows[0].n,0);
 await db.query("update dabbir_appointments set status='completed' where id=$1",[history]);
 assert.equal((await executeActivity()).verified,true);
});

test('brain SQL: availability loads identifiers from canonical state and persists the tool result',async()=>{
 await reset();
 // The downstream availability query has its own live suite; here the real SQL
 // authority wrapper is exercised against a deterministic database adapter.
 await db.exec(`create or replace function public.dabbir_whatsapp_ai_check_availability(b uuid,c uuid,s uuid,w uuid,t timestamp without time zone) returns jsonb language sql as $$select jsonb_build_object('slots','[]'::jsonb,'observed_service',s,'observed_conversation',c)$$;`);
 const state=understandConversation({context:context({batch_messages:[{body:'أبي غسيل كامل باجر الساعة 18:00'}]}),now:evalNow}).state;
 await commit(state);
 const result=await rpc('dabbir_semantic_check_availability_v1',[batch,lock,1]);
 assert.equal(result.observed_service,ids.service);assert.equal(result.observed_conversation,ids.conversation);
 const saved=(await load()).semantic_state;
 assert.equal(saved.last_tool_call.action,'CHECK_AVAILABILITY');assert.equal(saved.last_tool_result.slot_count,0);assert.equal(saved.last_tool_result.source,'DATABASE_FACT');
 assert.equal((await db.query('select count(*)::int n from dabbir_ai_action_ledger')).rows[0].n,0);
 await assert.rejects(rpc('dabbir_semantic_check_availability_v1',[batch,ids.other,1]),/SEMANTIC_BATCH_LOCK_INVALID/);
 await assert.rejects(rpc('dabbir_semantic_check_availability_v1',[batch,lock,2]),/SEMANTIC_VERSION_CONFLICT/);
 await db.exec('set role authenticated');
 await assert.rejects(rpc('dabbir_semantic_check_availability_v1',[batch,lock,1]),/permission denied/);
 await db.exec('reset role');
 await db.query("update dabbir_ai_conversation_state set semantic_state=jsonb_set(semantic_state,'{missing_fields}','[\"time\"]')");
 await assert.rejects(rpc('dabbir_semantic_check_availability_v1',[batch,lock,1]),/SEMANTIC_AVAILABILITY_NOT_AUTHORIZED/);
});

test('brain SQL: malformed availability rolls back result persistence',async()=>{
 await reset();
 await db.exec(`create or replace function public.dabbir_whatsapp_ai_check_availability(b uuid,c uuid,s uuid,w uuid,t timestamp without time zone) returns jsonb language sql as $$select '{}'::jsonb$$;`);
 const state=understandConversation({context:context({batch_messages:[{body:'أبي غسيل كامل باجر الساعة 18:00'}]}),now:evalNow}).state;
 await commit(state);
 await assert.rejects(rpc('dabbir_semantic_check_availability_v1',[batch,lock,1]),/SEMANTIC_AVAILABILITY_RESULT_INVALID/);
 assert.equal((await load()).semantic_state.last_tool_result,undefined);
});
