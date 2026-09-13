import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const business='10000000-0000-4000-8000-000000000001', other='10000000-0000-4000-8000-000000000002';
const owner='20000000-0000-4000-8000-000000000001', employee='20000000-0000-4000-8000-000000000002';
const query=(sql,args=[])=>db.query(sql,args);
const login=async user=>{await db.exec('reset role');await query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);await db.exec('set role authenticated');};
const candidates=bid=>query('select * from public.dabbir_owner_policy_candidates($1)',[bid]);
const activate=()=>query("select public.dabbir_activate_owner_policy($1,'handoff.continue','continue','yes','{}','owner_ui_explicit') id",[business]);
before(async()=>{
  await db.exec(`create schema auth;create schema dabbir_private;create role anon;create role authenticated;create role service_role;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table auth.users(id uuid primary key,active boolean default true);
    create table public.dabbir_businesses(id uuid primary key);
    create table public.dabbir_memberships(business_id uuid,user_id uuid,role text,status text);
    grant usage on schema auth,dabbir_private to authenticated;
    grant select on public.dabbir_memberships to authenticated;
    -- Account helper adapter; the owner-policy migrations and role boundary are real.
    create function dabbir_private.is_active_member(b uuid) returns boolean language sql stable security definer as $$
      select exists(select 1 from public.dabbir_memberships m join auth.users u on u.id=m.user_id where m.business_id=b and u.id=auth.uid() and u.active and m.status='active')$$;`);
  const original=fs.readFileSync('supabase/migrations/20260827155500_dabbir_owner_decision_memory_v1.sql','utf8');
  await db.exec(original.slice(0,original.indexOf('create or replace function dabbir_private.dabbir_owner_policy_skip_handoff')));
  await db.exec(fs.readFileSync('supabase/migrations/20260827155600_dabbir_owner_decision_memory_hardening_v2.sql','utf8'));
  await db.exec('revoke all on all functions in schema dabbir_private from public,anon,authenticated');
  await query('insert into auth.users(id) values($1),($2)',[owner,employee]);
  await query('insert into public.dabbir_businesses values($1),($2)',[business,other]);
  await query("insert into public.dabbir_memberships values($1,$2,'owner','active'),($1,$3,'employee','active')",[business,owner,employee]);
  await login(owner);
  await assert.rejects(candidates(business),/permission denied for function dabbir_owner_policy_candidates/);
  await db.exec('reset role');
  await db.exec(fs.readFileSync('supabase/migrations/20260908052500_dabbir_owner_policy_rpc_boundary_v3.sql','utf8'));
});
after(()=>db.close());
test('policy boundary: reproduces old permission failure and permits active owner empty read',async()=>{
  await login(owner);assert.equal((await candidates(business)).rows.length,0);
  await assert.rejects(activate(),/INSUFFICIENT_MATCHING_OBSERVATIONS/);
});
test('policy boundary: explicit activation, pause, resume, revoke and audit still work',async()=>{
  await db.exec('reset role');
  await query("insert into dabbir_owner_decision_observations(business_id,owner_user_id,action_key,decision_key,decision_value,risk_class,source_type,source_id) select $1,$2,'handoff.continue','continue','yes','LOW','owner_action',gen_random_uuid() from generate_series(1,3)",[business,owner]);
  await login(owner);assert.equal((await candidates(business)).rows[0].observation_count,3);
  const id=(await activate()).rows[0].id;
  for(const state of ['PAUSED','ACTIVE','REVOKED'])assert.equal((await query('select public.dabbir_set_owner_policy_state($1,$2,$3) state',[business,id,state])).rows[0].state,state);
  await assert.rejects(query('select public.dabbir_set_owner_policy_state($1,$2,$3)',[business,id,'ACTIVE']),/REVOKED_POLICY_IMMUTABLE/);
  assert.equal((await query('select count(*)::int n from dabbir_owner_policy_audit')).rows[0].n,4);
});
test('policy boundary: foreign tenant, employee and missing identity cannot read or mutate',async()=>{
  await login(owner);await assert.rejects(candidates(other),/OWNER_REQUIRED/);
  for(const user of [employee,null]){await login(user);await assert.rejects(candidates(business),/OWNER_REQUIRED/);await assert.rejects(activate(),/OWNER_REQUIRED/);await assert.rejects(query("select public.dabbir_set_owner_policy_state($1,$2,'PAUSED')",[business,other]),/OWNER_REQUIRED/);}
});
test('policy boundary: suspended account and inactive membership fail closed',async()=>{
  await db.exec('reset role');await query('update auth.users set active=false where id=$1',[owner]);await login(owner);
  await assert.rejects(candidates(business),/OWNER_REQUIRED/);await assert.rejects(activate(),/OWNER_REQUIRED/);
  await db.exec('reset role');await query('update auth.users set active=true where id=$1',[owner]);await query("update dabbir_memberships set status='suspended' where user_id=$1",[owner]);await login(owner);
  await assert.rejects(candidates(business),/OWNER_REQUIRED/);await assert.rejects(activate(),/OWNER_REQUIRED/);
});
test('policy boundary: private implementation, public anonymous execute and direct writes remain denied',async()=>{
  await db.exec('reset role');
  const rows=(await query("select n.nspname,p.proname,has_function_privilege('anon',p.oid,'EXECUTE') a,has_function_privilege('authenticated',p.oid,'EXECUTE') u from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('dabbir_owner_policy_candidates','dabbir_activate_owner_policy','dabbir_set_owner_policy_state')")).rows;
  assert.equal(rows.length,6);for(const row of rows){assert.equal(row.a,false);assert.equal(row.u,row.nspname==='public');}
  await login(owner);await assert.rejects(query('select * from dabbir_private.dabbir_owner_policy_candidates($1)',[business]),/permission denied/);
  await assert.rejects(query("delete from public.dabbir_owner_policy_versions where business_id=$1",[business]),/permission denied/);
  await db.exec('set role anon');await assert.rejects(candidates(business),/permission denied/);
});
