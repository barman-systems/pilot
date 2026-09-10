import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {materialize} from '../scripts/dabbir-unseen-evaluate.mjs';
import {understandConversation} from '../api/_dabbir-semantic-engine.js';
import {runUnderstandingTurn} from '../api/_dabbir-understanding-orchestrator.js';

const spec=['conditional','salon',['أبي قص شعر الساعة 18:00','إذا ما فيه اليوم شوف باجر'],{}];
const fixture=()=>materialize(spec).business_state;
const reference=new Date('2026-09-10T08:00:00Z');
const reduce=(message,previous,proposal)=>understandConversation({context:{...fixture(),batch_messages:[{body:message}]},previous,proposal,now:reference}).state;

test('explicit ordered date preference survives model correction and is cleared by the current customer',()=>{
 let state=reduce('أبي قص شعر الساعة 18:00');
 state=reduce('إذا ما فيه اليوم شوف باجر',state,{intent:'BOOKING',action:'CHECK_AVAILABILITY',confidence:.99,entities:[{entity:'date',value:'2026-09-11',evidence:'باجر',confidence:.99,correction:true}]});
 assert.equal(state.entities.date.value,'2026-09-10');assert.equal(state.entities.date.alternative_value,'2026-09-11');
 assert.equal(state.entities.date.source,'CUSTOMER_STATED');
 const changed=reduce('لا قصدي عقب باجر',state);
 assert.equal(changed.entities.date.value,'2026-09-12');assert.equal(changed.entities.date.alternative_value,undefined);
 const withdrawn=reduce('لا خلاص غيرت رأيي',state);
 assert.equal(withdrawn.goal,'UNKNOWN');assert.equal(withdrawn.entities.date.alternative_value,undefined);
 const explicit=reduce('إذا ما فيه اليوم شوف باجر لا قصدي عقب باجر',state);
 assert.equal(explicit.entities.date.value,'2026-09-12');assert.equal(explicit.entities.date.alternative_value,undefined);
});

async function runCase({firstAvailable=false,failAdvance=false,failSecond=false}={}){
 let state={},version=0,revision=0,pending=null;
 const reads=[],replies=[],transitions=[],sentVersions=[];
 const c=fixture();
 const rpc=async(name,args)=>{
  if(name==='dabbir_semantic_load_v2')return {semantic_state:state,version,message_revision:++revision,activity_profile:c.activity_profile};
  if(name==='dabbir_semantic_commit_v2'){state=structuredClone(args.p_state);return {state,version:++version};}
  if(name==='dabbir_semantic_check_availability_v1'){
   reads.push({date:state.entities.date.value,version:args.p_version});
   if(failSecond&&reads.length===2)throw new Error('READ_FAILED');
   return {slots:firstAvailable||reads.length===2?[{service_id:state.entities.service.value,starts_at:state.entities.date.value+'T14:00:00Z'}]:[]};
  }
  if(name==='dabbir_semantic_advance_availability_date_v1'){
   transitions.push(args);if(failAdvance)throw new Error('SEMANTIC_VERSION_CONFLICT');
   state=structuredClone(state);state.entities.date.value=state.entities.date.alternative_value;
   delete state.entities.date.alternative_value;delete state.entities.date.alternative_condition;
   return {state,version:++version};
  }
  if(name==='dabbir_semantic_set_pending_v2'){pending={pending_action:args.p_action,payload:args.p_payload};return true;}
  if(name==='dabbir_semantic_execute_v2')assert.fail('a date preference never confirms a booking');
  return true;
 };
 const run=message=>runUnderstandingTurn({claim:{batch_id:'fixture',lock_token:'fixture'},context:{...c,batch_messages:[{body:message}],pending_state:pending},rpc,now:()=>reference,
  deliver:async(claim,_context,reply)=>{replies.push(reply);sentVersions.push(claim.semantic_version);return {providerMessageId:'fixture-'+replies.length};},
  finish:async()=>true,handoff:async()=>assert.fail('unexpected handoff'),slotsText:slots=>'Available '+slots[0].starts_at,bookingText:()=>assert.fail('unexpected booking receipt')});
 await run('أبي قص شعر الساعة 18:00');
 const execute=()=>run('إذا ما فيه اليوم شوف باجر');
 return {execute,reads,replies,transitions,sentVersions,get state(){return state;},get pending(){return pending;}};
}

test('empty today advances canonical state and checks tomorrow before presenting a verified slot',async()=>{
 const h=await runCase();await h.execute();
 assert.deepEqual(h.reads,[{date:'2026-09-10',version:2},{date:'2026-09-11',version:3}]);
 assert.equal(h.transitions.length,1);assert.equal(h.sentVersions.at(-1),3);
 assert.match(h.replies.at(-1),/2026-09-11/);assert.equal(h.state.entities.date.value,'2026-09-11');
 assert.equal(h.pending.pending_action,'choose_slot');assert.equal(h.pending.payload.presented,true);
});
test('available today is presented without switching to tomorrow',async()=>{
 const h=await runCase({firstAvailable:true});await h.execute();
 assert.deepEqual(h.reads,[{date:'2026-09-10',version:2}]);assert.equal(h.transitions.length,0);assert.match(h.replies.at(-1),/2026-09-10/);
});
for(const config of [{failAdvance:true},{failSecond:true}])test('conditional failure never sends a result or books: '+Object.keys(config)[0],async()=>{
 const h=await runCase(config);await assert.rejects(h.execute(),/SEMANTIC_VERSION_CONFLICT|READ_FAILED/);
 assert.equal(h.replies.length,1,'only the previous date question was sent');assert.equal(h.pending,null);
});

const ids={business:'10000000-0000-4000-8000-000000000001',conversation:'10000000-0000-4000-8000-000000000002',batch:'10000000-0000-4000-8000-000000000003',lock:'10000000-0000-4000-8000-000000000004'};
const sql=fs.readFileSync(new URL('../supabase/migrations/20260910043500_dabbir_conditional_availability_date_v1.sql',import.meta.url),'utf8');
test('PostgreSQL date transition validates receipt, source, revision and consumes the alternative once',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create table public.dabbir_message_batches(id uuid,business_id uuid,conversation_id uuid,lock_token uuid);
   create table public.dabbir_conversations(id uuid,business_id uuid,understanding_revision bigint);
   create table public.dabbir_ai_conversation_state(business_id uuid,conversation_id uuid,semantic_batch_id uuid,semantic_version bigint,semantic_message_revision bigint,semantic_state jsonb,updated_at timestamptz);
   create table public.dabbir_ai_understanding_events(business_id uuid,conversation_id uuid,batch_id uuid,event_type text,version bigint,metrics jsonb);
   create function public.dabbir_semantic_assert_current_v2(b uuid,l uuid,v bigint) returns boolean language plpgsql as $$begin
    if not exists(select 1 from public.dabbir_message_batches where id=b and lock_token=l) then raise exception 'LEASE_INVALID';end if;
    return true;
   end$$;`);
  await db.exec(sql);
  await db.query('insert into public.dabbir_message_batches values($1,$2,$3,$4)',[ids.batch,ids.business,ids.conversation,ids.lock]);
  await db.query('insert into public.dabbir_conversations values($1,$2,7)',[ids.conversation,ids.business]);
  const original={goal:'BOOK_SERVICE',pending_action:'CHECK_AVAILABILITY',missing_fields:[],unresolved_references:[],operational_confidence:.99,
   entities:{date:{value:'2026-09-10',alternative_value:'2026-09-11',alternative_condition:'NO_AVAILABILITY',source:'CUSTOMER_STATED',status:'active',confidence:.99}},
   last_tool_call:{action:'CHECK_AVAILABILITY',version:4},last_tool_result:{action:'CHECK_AVAILABILITY',source:'DATABASE_FACT',slot_count:0,at:new Date().toISOString()}};
  await db.query('insert into public.dabbir_ai_conversation_state values($1,$2,$3,4,7,$4,now())',[ids.business,ids.conversation,ids.batch,JSON.stringify(original)]);
  const call=()=>db.query('select public.dabbir_semantic_advance_availability_date_v1($1,$2,4) as result',[ids.batch,ids.lock]);
  const set=state=>db.query('update public.dabbir_ai_conversation_state set semantic_state=$1,semantic_version=4,semantic_message_revision=7',[JSON.stringify(state)]);
  for(const [change,code] of [
   [s=>delete s.last_tool_result,'SEMANTIC_EMPTY_AVAILABILITY_REQUIRED'],
   [s=>s.last_tool_result.slot_count=1,'SEMANTIC_EMPTY_AVAILABILITY_REQUIRED'],
   [s=>s.last_tool_result.source='AI_INFERENCE','SEMANTIC_EMPTY_AVAILABILITY_REQUIRED'],
   [s=>s.last_tool_call.version=3,'SEMANTIC_EMPTY_AVAILABILITY_REQUIRED'],
   [s=>s.last_tool_result.at='2020-01-01T00:00:00Z','SEMANTIC_EMPTY_AVAILABILITY_REQUIRED'],
   [s=>s.entities.date.source='AI_INFERENCE','SEMANTIC_EXPLICIT_ALTERNATE_DATE_REQUIRED'],
   [s=>delete s.entities.date.alternative_value,'SEMANTIC_EXPLICIT_ALTERNATE_DATE_REQUIRED'],
   [s=>s.entities.date.alternative_value='2026-09-12','SEMANTIC_ALTERNATE_DATE_INVALID'],
   [s=>s.pending_action='CREATE_BOOKING','SEMANTIC_DATE_TRANSITION_NOT_AUTHORIZED'],
  ]){
   const value=structuredClone(original);change(value);await set(value);await assert.rejects(call(),new RegExp(code));
   assert.equal((await db.query('select semantic_version from public.dabbir_ai_conversation_state')).rows[0].semantic_version,4);
   assert.equal((await db.query('select count(*)::int as n from public.dabbir_ai_understanding_events')).rows[0].n,0);
  }
  await set(original);await db.exec('update public.dabbir_ai_conversation_state set semantic_message_revision=6');
  await assert.rejects(call(),/SEMANTIC_VERSION_CONFLICT/);await set(original);
  const result=(await call()).rows[0].result;
  assert.equal(result.version,5);assert.equal(result.state.entities.date.value,'2026-09-11');
  assert.equal(result.state.entities.date.alternative_value,undefined);assert.equal(result.state.availability_date_transition.from,'2026-09-10');
  await assert.rejects(call(),/SEMANTIC_VERSION_CONFLICT/);
  assert.equal((await db.query('select count(*)::int as n from public.dabbir_ai_understanding_events')).rows[0].n,1);
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);await assert.rejects(call(),/permission denied/);await db.exec('reset role');
  }
 }finally{await db.close();}
});
