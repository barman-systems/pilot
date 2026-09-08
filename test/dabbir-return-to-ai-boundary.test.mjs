import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const b='10000000-0000-4000-8000-000000000001',foreign='10000000-0000-4000-8000-000000000002',u='20000000-0000-4000-8000-000000000001',employee='20000000-0000-4000-8000-000000000002',c='30000000-0000-4000-8000-000000000001',otherBranch='30000000-0000-4000-8000-000000000002';
const q=(sql,args=[])=>db.query(sql,args);
const login=async id=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role authenticated')};
const resume=(bid=b,cid=c)=>q('select public.dabbir_return_conversation_to_ai($1,$2) result',[bid,cid]);
async function reset(){
 await db.exec('reset role');await db.exec('delete from dabbir_owner_decision_observations;delete from dabbir_messages;delete from dabbir_handoffs;delete from dabbir_ai_conversation_state;delete from dabbir_conversations;update auth.users set active=true;update dabbir_memberships set status=\'active\',allow_reply=true,allow_handoff=true');
 await q("insert into dabbir_conversations values($1,$2,'A','human_active',now(),7),($3,$2,'B','human_active',now(),11)",[c,b,otherBranch]);
 await q("insert into dabbir_handoffs(id,business_id,conversation_id,state,route_class,reason,priority,created_at,updated_at) values(gen_random_uuid(),$1,$2,'HUMAN_ACTIVE','SUPPORT','manual_takeover',70,now(),now())",[b,c]);
 await q("insert into dabbir_ai_conversation_state values($1,$2,'handoff','{\"handoff_id\":\"old\"}',now(),' {\"entities\":{\"service\":{\"source\":\"DATABASE_FACT\"}}}',4,7),($1,$3,'choose_slot','{\"slots\":[1]}',now(),'{}',2,11)",[b,c,otherBranch]);
}
before(async()=>{
 await db.exec(`create schema auth;create schema dabbir_private;create schema extensions;create role anon;create role authenticated;create role service_role;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table auth.users(id uuid primary key,active boolean default true);
 create table dabbir_businesses(id uuid primary key);
 create table dabbir_memberships(business_id uuid,user_id uuid,role text,status text,allow_reply boolean default true,allow_handoff boolean default true);
 create function dabbir_private.is_active_member(b uuid) returns boolean language sql security definer set search_path=public as $$select exists(select 1 from dabbir_memberships m join auth.users u on u.id=m.user_id where m.business_id=b and m.user_id=auth.uid() and u.active and m.status='active')$$;
 create function dabbir_private.has_permission(b uuid,p text) returns boolean language sql security definer set search_path=public as $$select dabbir_private.is_active_member(b) and exists(select 1 from dabbir_memberships m where m.business_id=b and m.user_id=auth.uid() and case when p='reply_conversations' then m.allow_reply else m.allow_handoff end)$$;
 -- Digest adapter only: production uses the existing pgcrypto SHA-256 function.
 create function extensions.digest(text,text) returns bytea language sql as $$select decode(md5($1)||md5($1),'hex')$$;
 grant usage on schema auth,dabbir_private to authenticated;
 grant select on dabbir_memberships to authenticated;
 create table dabbir_conversations(id uuid primary key,business_id uuid,branch text,state text,updated_at timestamptz,understanding_revision bigint);
 create table dabbir_handoffs(id uuid primary key,business_id uuid,conversation_id uuid,state text,route_class text,reason text,priority integer,created_at timestamptz,updated_at timestamptz,human_active_at timestamptz,assigned_at timestamptz,returned_to_ai_at timestamptz);
 create table dabbir_messages(business_id uuid,conversation_id uuid,sender_type text,created_at timestamptz);
 create table dabbir_ai_conversation_state(business_id uuid,conversation_id uuid,pending_action text,payload jsonb,expires_at timestamptz,semantic_state jsonb,semantic_version bigint,semantic_message_revision bigint,updated_at timestamptz default now());
 alter table dabbir_ai_conversation_state enable row level security;alter table dabbir_ai_conversation_state force row level security;
 grant select,update on dabbir_conversations,dabbir_handoffs to authenticated;grant select on dabbir_messages to authenticated;
 alter table dabbir_conversations enable row level security;alter table dabbir_conversations force row level security;
 create policy fixture_conversation_scope on dabbir_conversations to authenticated using(dabbir_private.is_active_member(business_id) and (branch='A' or exists(select 1 from dabbir_memberships m where m.business_id=dabbir_conversations.business_id and m.user_id=auth.uid() and m.role='owner')));
 alter table dabbir_handoffs enable row level security;
 create policy fixture_handoff_scope on dabbir_handoffs to authenticated using(exists(select 1 from dabbir_conversations c where c.id=conversation_id and c.business_id=dabbir_handoffs.business_id));`);
 const original=fs.readFileSync('supabase/migrations/20260827155500_dabbir_owner_decision_memory_v1.sql','utf8');
 await db.exec(original.slice(0,original.indexOf('create or replace function dabbir_private.dabbir_owner_policy_skip_handoff')));
 await db.exec('revoke all on function dabbir_private.dabbir_record_owner_decision(uuid,text,text,text,text,jsonb,text,uuid) from public,anon,authenticated');
 await q('insert into auth.users(id) values($1),($2)',[u,employee]);await q('insert into dabbir_businesses values($1),($2)',[b,foreign]);await q("insert into dabbir_memberships(business_id,user_id,role,status) values($1,$2,'owner','active'),($1,$3,'employee','active')",[b,u,employee]);
 // Reproduce the live invoker function's direct write to the private state table.
 const start=original.indexOf('create or replace function public.dabbir_return_conversation_to_ai');
 const end=original.indexOf('comment on table',start);
 const live=original.slice(start,end).replace("  update public.dabbir_conversations set state='waiting_customer'", "  update public.dabbir_ai_conversation_state set pending_action='none' where business_id=p_business_id and conversation_id=p_conversation_id and pending_action='handoff';\n  update public.dabbir_conversations set state='waiting_customer'");
 await db.exec(live);await reset();await login(u);await assert.rejects(resume(),/permission denied for table dabbir_ai_conversation_state/);
 await db.exec('reset role');await db.exec(fs.readFileSync('supabase/migrations/20260908063300_dabbir_return_to_ai_state_boundary_v3.sql','utf8'));
});
after(()=>db.close());
test('return boundary: owner resumes, clears handoff only, preserves verified facts and invalidates old decision',async()=>{
 await reset();await login(u);assert.equal((await resume()).rows[0].result.state,'waiting_customer');await db.exec('reset role');
 const state=(await q('select * from dabbir_ai_conversation_state where conversation_id=$1',[c])).rows[0];assert.equal(state.pending_action,'none');assert.deepEqual(state.payload,{});assert.equal(state.expires_at,null);assert.equal(state.semantic_version,4);assert.equal(state.semantic_state.entities.service.source,'DATABASE_FACT');
 assert.equal(Number((await q('select understanding_revision from dabbir_conversations where id=$1',[c])).rows[0].understanding_revision),8);assert.equal(state.semantic_message_revision,7);assert.equal((await q('select state from dabbir_handoffs')).rows[0].state,'RETURNED_TO_AI');
 assert.equal((await q('select pending_action from dabbir_ai_conversation_state where conversation_id=$1',[otherBranch])).rows[0].pending_action,'choose_slot');
 await login(u);await resume();await db.exec('reset role');assert.equal(Number((await q('select understanding_revision from dabbir_conversations where id=$1',[c])).rows[0].understanding_revision),8);
});
test('return boundary: business permissions and branch RLS stay authoritative for employee',async()=>{
 await reset();await login(employee);await assert.rejects(resume(b,otherBranch),/CONVERSATION_NOT_FOUND/);await assert.rejects(resume(foreign,c),/REPLY_PERMISSION_REQUIRED/);assert.equal((await resume()).rows[0].result.ok,true);
 for(const permission of ['allow_reply','allow_handoff']){await reset();await q('update dabbir_memberships set '+permission+'=false where user_id=$1',[u]);await login(u);await assert.rejects(resume(),/PERMISSION_REQUIRED|HANDOFF_MANAGEMENT_REQUIRED/)}
});
test('return boundary: suspended accounts and memberships and anonymous execution fail closed',async()=>{
 await reset();await q('update auth.users set active=false where id=$1',[u]);await login(u);await assert.rejects(resume(),/REPLY_PERMISSION_REQUIRED/);
 await reset();await q("update dabbir_memberships set status='suspended' where user_id=$1",[u]);await login(u);await assert.rejects(resume(),/REPLY_PERMISSION_REQUIRED/);await db.exec('set role anon');await assert.rejects(resume(),/permission denied/);
});
test('return boundary: low-risk owner observation remains inactive and idempotent without private EXECUTE',async()=>{
 await reset();await q("update dabbir_handoffs set route_class='OWNER_DECISION',priority=30,reason='routine_followup'");await login(u);await resume();await resume();
 await assert.rejects(q('select dabbir_private.conversation_return_to_ai_v3()'),/permission denied/);await assert.rejects(q("update dabbir_ai_conversation_state set pending_action='none'"),/permission denied/);await db.exec('reset role');
 const rows=(await q('select source_type,match_bounds from dabbir_owner_decision_observations')).rows;assert.equal(rows.length,1);assert.equal(rows[0].source_type,'return_to_ai');assert.equal(rows[0].match_bounds.reason_hash.length,64);assert.equal((await q('select count(*)::int n from dabbir_owner_policy_versions')).rows[0].n,0);
});
test('return boundary: human replies and sensitive reasons do not produce learned observations',async()=>{
 for(const sensitive of [true,false]){await reset();await q("update dabbir_handoffs set route_class='OWNER_DECISION',priority=30,reason=$1",[sensitive?'payment.approve':'routine_followup']);if(!sensitive)await q("insert into dabbir_messages values($1,$2,'human',now()+interval '1 second')",[b,c]);await login(u);await resume();await db.exec('reset role');assert.equal((await q('select count(*)::int n from dabbir_owner_decision_observations')).rows[0].n,0)}
});
