import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
const db=new PGlite(),read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const root='10000000-0000-4000-8000-000000000001',delegate='10000000-0000-4000-8000-000000000002',customer='10000000-0000-4000-8000-000000000003',other='10000000-0000-4000-8000-000000000004',a='20000000-0000-4000-8000-000000000001',b='20000000-0000-4000-8000-000000000002';
const rpc=async(name,args=[])=>{const result=await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') result',args);return result.rows[0].result};
before(async()=>{
 await db.exec(await read('test/fixtures/owner-db-schema.sql'));
 // Unchanged downstream aggregate and customer-360 providers are fixtures; the scoped wrappers and permission helpers are real SQL.
 await db.exec(`create table auth.users(id uuid,email text);
 create function public.dabbir_owner_ops_metrics_v1() returns jsonb language sql as $$select '{"runtime_5xx_24h":null,"runtime_5xx_state":"NEEDS_INSTRUMENTATION"}'::jsonb$$;
 create function public.dabbir_platform_customer_360_v1(uuid,uuid) returns jsonb language sql as $$select jsonb_build_object('account',jsonb_build_object('user_id',$2),'businesses',jsonb_build_array(jsonb_build_object('id','${a}'),jsonb_build_object('id','${b}')),'support','[]'::jsonb,'incidents','[]'::jsonb,'audit_history','[]'::jsonb,'payments',jsonb_build_array('private-global-row'),'feedback',jsonb_build_array('private-global-row'))$$;
 alter table dabbir_private.platform_customer_support_cases alter column id set default gen_random_uuid();
 alter table dabbir_private.platform_customer_support_cases add primary key(id);
 alter table dabbir_private.platform_customer_support_cases add check(status in ('open','waiting','resolved'));
 alter table dabbir_private.platform_customer_support_notes alter column id set default gen_random_uuid();
 alter table dabbir_private.platform_staff_audit alter column id set default gen_random_uuid();
 alter table dabbir_private.platform_staff_audit alter column created_at set default now();`);
 await db.exec(await read('supabase/migrations/20260907110000_owner_dashboard_consolidation.sql'));
 await db.exec(await read('supabase/migrations/20260907131500_owner_support_consolidation.sql'));
 await db.query(`insert into public.dabbir_platform_admins(user_id,role,active,permissions,granular_permissions,access_scope) values($1,'ROOT_OWNER',true,'{}','{}','{"type":"ALL_BUSINESSES"}'),($2,'OWNER_DELEGATE',true,'{manage_customers,manage_support,manage_incidents,manage_integrations,manage_ceo_commands,manage_system}','{customers.view,support.view,support.reply,businesses.view,audit.view,incidents.view,integrations.view}',jsonb_build_object('type','SPECIFIC_BUSINESS','business_id',$3::text))`,[root,delegate,a]);
 await db.exec(`insert into dabbir_private.platform_permissions(code,owner_only) values ('customers.view',false),('support.view',false),('support.reply',false),('support.close',false),('businesses.view',false),('system.view',false),('payments.view',false),('audit.view',false),('incidents.view',false),('integrations.view',false),('ceo.view',false),('ceo.create',false),('ceo.update',false);
 insert into public.dabbir_businesses(id,name,country_code,demo_mode) values('${a}','North','AE',false),('${b}','South','SA',false);
 insert into public.dabbir_user_accounts(user_id,customer_no) values('${customer}','DAB-900001'),('${other}','DAB-900002');
 insert into public.dabbir_memberships(user_id,business_id,status) values('${customer}','${a}','active'),('${other}','${b}','active');
 insert into public.dabbir_whatsapp_connections(id,business_id,status) values(gen_random_uuid(),'${a}','verification_required'),(gen_random_uuid(),'${b}','error');
 insert into public.dabbir_calendar_connections(id,business_id,status,sync_enabled) values(gen_random_uuid(),'${b}','active',true);
 insert into public.dabbir_feedback(id,user_id,business_id,message,created_at) values(gen_random_uuid(),'${customer}','${a}','Allowed',now()),(gen_random_uuid(),'${other}','${b}','Denied',now());
 insert into dabbir_private.dabbir_ceo_commands(id,status) values(gen_random_uuid(),'QUEUED');`);
});
beforeEach(async()=>{await db.query("update public.dabbir_platform_admins set access_scope=jsonb_build_object('type','SPECIFIC_BUSINESS','business_id',$2::text),access_expires_at=null where user_id=$1",[delegate,a])});
after(()=>db.close());
test('pending P2 migration installs canonical roles, revokes changed sessions and preserves CUSTOM grants',async()=>{
 const isolated=new PGlite();
 try{
  await isolated.exec(await read('test/fixtures/owner-db-schema.sql'));
  await isolated.exec(`alter table dabbir_private.platform_permissions add primary key(code);
   create table dabbir_private.platform_roles(id uuid primary key default gen_random_uuid(),code text unique);
   create table dabbir_private.platform_role_permissions(role_id uuid,permission_code text,primary key(role_id,permission_code));
   create table dabbir_private.owner_sessions(actor_user_id uuid,revoked_at timestamptz);
   insert into dabbir_private.platform_roles(code) values('OPERATIONS_MANAGER'),('CUSTOM');
   insert into public.dabbir_platform_admins(user_id,role,role_code,active,permissions,granular_permissions,access_scope) values
    ('${delegate}','OWNER_DELEGATE','OPERATIONS_MANAGER',true,'{}','{}','{"type":"ALL_BUSINESSES"}'),
    ('${customer}','OWNER_DELEGATE','CUSTOM',true,'{manage_customers}','{customers.view}','{"type":"ALL_BUSINESSES"}');
   insert into dabbir_private.owner_sessions(actor_user_id) values('${delegate}'),('${customer}');`);
  const governance=await read('supabase/migrations/20260905202000_dabbir_owner_team_governance_v2.sql');
  await isolated.exec(governance.match(/create or replace function dabbir_private\.platform_role_permissions_v1\([\s\S]*?\n\$\$;/i)[0]);
  await isolated.exec(await read('supabase/migrations/20260907013000_dabbir_owner_granular_capabilities_p2.sql'));
  const roles=(await isolated.query('select user_id,granular_permissions from public.dabbir_platform_admins order by user_id')).rows;
  assert.ok(roles.find(r=>r.user_id===delegate).granular_permissions.includes('incidents.update'));
  assert.deepEqual(roles.find(r=>r.user_id===customer).granular_permissions,['customers.view']);
  const sessions=(await isolated.query('select actor_user_id,revoked_at is not null revoked from dabbir_private.owner_sessions')).rows;
  assert.equal(sessions.find(r=>r.actor_user_id===delegate).revoked,true);assert.equal(sessions.find(r=>r.actor_user_id===customer).revoked,false);
  assert.equal((await isolated.query("select count(*) n from dabbir_private.platform_staff_audit where action='P2_ROLE_CAPABILITY_RECONCILED'")).rows[0].n,1);
  await assert.rejects(isolated.query('select public.dabbir_ceo_commands_authorized_v1($1,30)',[customer]),/DABBIR_PLATFORM_CAPABILITY_REQUIRED/);
 }finally{await isolated.close()}
});
test('overview is scoped before counting and hides global system/CEO/financial values',async()=>{
 const all=await rpc('dabbir_platform_command_center_overview_v1',[root]),scoped=await rpc('dabbir_platform_command_center_overview_v1',[delegate]);
 assert.equal(all.customers.accounts,2);assert.equal(scoped.customers.accounts,1);assert.equal(scoped.customers.live_businesses,1);assert.equal(scoped.whatsapp.configured,1);assert.equal(scoped.whatsapp.error,0);assert.equal(scoped.calendar.configured,0);
 for(const key of ['ceo','system','payments'])assert.deepEqual(scoped[key],{state:'NO_PERMISSION'});assert.equal(all.system.runtime_5xx_24h,null);
});
test('effective permissions and expiry reject stale access without zero-filling',async()=>{
 await db.query('update public.dabbir_platform_admins set access_expires_at=now()-interval \'1 hour\' where user_id=$1',[delegate]);
 await assert.rejects(rpc('dabbir_platform_command_center_overview_v1',[delegate]),/DABBIR_PLATFORM_ADMIN_REQUIRED/);
 await db.query('update public.dabbir_platform_admins set access_expires_at=null where user_id=$1',[delegate]);
});
test('all supported business scopes enforce counts and feedback visibility',async()=>{
 for(const [scope,count] of [[{type:'ALL_BUSINESSES'},2],[{type:'ASSIGNED_BUSINESSES_ONLY',business_ids:[a]},1],[{type:'SPECIFIC_REGION',region_code:'SA'},1],[{type:'OWN_TASKS_ONLY'},0],[{type:'SPECIFIC_BUSINESS',business_id:a},1]]){
  await db.query('update public.dabbir_platform_admins set access_scope=$2 where user_id=$1',[delegate,JSON.stringify(scope)]);
  const out=await rpc('dabbir_platform_command_center_overview_v1',[delegate]);assert.equal(out.customers.live_businesses,count,scope.type);
  const feedback=await rpc('dabbir_platform_feedback_list_v1',[delegate,100]);assert.equal(feedback.length,count,scope.type);
 }
});
test('root can inspect customers before they create a business; delegates cannot',async()=>{
 const noBusiness='10000000-0000-4000-8000-000000000009';const data=await rpc('dabbir_platform_customer_360_scoped_v2',[root,noBusiness]);assert.equal(data.account.user_id,noBusiness);
 await assert.rejects(rpc('dabbir_platform_customer_360_scoped_v2',[delegate,noBusiness]),/DABBIR_CUSTOMER_OUTSIDE_SCOPE/);
 const scoped=await rpc('dabbir_platform_customer_360_scoped_v2',[delegate,customer]);assert.deepEqual(scoped.businesses,[{id:a}]);assert.deepEqual(scoped.payments,[]);assert.deepEqual(scoped.feedback,[]);
});
test('support action persists its case and note atomically with the existing audit',async()=>{
 const receipt=await rpc('dabbir_platform_support_action_v2',[delegate,'CREATE',null,customer,'DAB-900001',a,'general','normal','SQL QA support','First persisted note']);
 assert.equal(receipt.result,'SUCCESS');assert.match(receipt.case_id,/^[0-9a-f-]{36}$/);
 const notes=await db.query('select note from dabbir_private.platform_customer_support_notes where case_id=$1',[receipt.case_id]);assert.equal(notes.rows[0].note,'First persisted note');
 const audit=await db.query("select action,metadata->>'case_id' case_id from dabbir_private.platform_staff_audit");assert.equal(audit.rows[0].case_id,receipt.case_id);assert.equal(audit.rows[0].action,'SUPPORT_CREATE');
 await assert.rejects(rpc('dabbir_platform_support_action_v2',[delegate,'UPDATE',receipt.case_id,null,null,null,null,null,null,null,'resolved']),/DABBIR_SUPPORT_CAPABILITY_REQUIRED/);
 await rpc('dabbir_platform_support_action_v2',[root,'UPDATE',receipt.case_id,null,null,null,null,null,null,null,'resolved']);
 await rpc('dabbir_platform_support_action_v2',[root,'UPDATE',receipt.case_id,null,null,null,null,null,null,null,'open']);
 const row=(await db.query('select status,resolved_at from dabbir_private.platform_customer_support_cases where id=$1',[receipt.case_id])).rows[0];assert.equal(row.status,'open');assert.equal(row.resolved_at,null);
});
test('mismatched support targets and out-of-scope writes leave no cases or audit rows',async()=>{
 const before=(await db.query('select count(*) n from dabbir_private.platform_staff_audit')).rows[0].n;
 await assert.rejects(rpc('dabbir_platform_support_action_v2',[delegate,'CREATE',null,customer,'DAB-900002',a,'general','normal','Wrong account']),/DABBIR_SUPPORT_CUSTOMER_MISMATCH/);
 await assert.rejects(rpc('dabbir_platform_support_action_v2',[delegate,'CREATE',null,other,'DAB-900002',b,'general','normal','Wrong scope']),/DABBIR_BUSINESS_SCOPE_DENIED/);
 assert.equal((await db.query('select count(*) n from dabbir_private.platform_staff_audit')).rows[0].n,before);
});
test('customer-visible support uses one scoped read model and audits only authorized replies',async()=>{
 const receipt=await rpc('dabbir_platform_support_action_v2',[root,'CREATE',null,customer,'DAB-900001',a,'general','normal','Customer thread verification']);
 await assert.rejects(rpc('dabbir_platform_support_reply_customer',[delegate,'DAB-900001',receipt.case_id,'Visible response']),/DABBIR_SUPPORT_CASE_NOT_FOUND/);
 await db.query('update dabbir_private.platform_customer_support_cases set customer_visible=true where id=$1',[receipt.case_id]);
 const reply=await rpc('dabbir_platform_support_reply_customer',[delegate,'DAB-900001',receipt.case_id,'Visible response']);
 assert.equal(reply.id,receipt.case_id);assert.ok(reply.message_id);
 const summary=await rpc('dabbir_platform_support_summary',[delegate,'DAB-900001']);
 const listed=await rpc('dabbir_platform_support_list_v2',[delegate,'DAB-900001']);
 assert.deepEqual(summary.cases,listed);assert.ok(listed.find(c=>c.id===receipt.case_id).messages.some(m=>m.id===reply.message_id&&m.body==='Visible response'));
 assert.equal((await db.query("select count(*) n from dabbir_private.platform_customer_admin_audit where action='support_customer_reply' and details->>'message_id'=$1",[reply.message_id])).rows[0].n,1);
 const denied=await rpc('dabbir_platform_support_action_v2',[root,'CREATE',null,other,'DAB-900002',b,'general','normal','Out of scope thread']);
 await db.query('update dabbir_private.platform_customer_support_cases set customer_visible=true where id=$1',[denied.case_id]);
 await assert.rejects(rpc('dabbir_platform_support_reply_customer',[delegate,'DAB-900002',denied.case_id,'Must not persist']),/DABBIR_BUSINESS_SCOPE_DENIED/);
 await assert.rejects(rpc('dabbir_platform_support_summary',[delegate,'DAB-900002']),/DABBIR_CUSTOMER_OUTSIDE_SCOPE/);
 assert.equal((await db.query('select count(*) n from dabbir_private.platform_customer_support_messages where case_id=$1',[denied.case_id])).rows[0].n,0);
});
test('global CEO command workflows reject business-scoped delegates at the database boundary',async()=>{
 await assert.rejects(rpc('dabbir_ceo_commands_authorized_v1',[delegate,30]),/DABBIR_GLOBAL_SCOPE_REQUIRED/);
 await assert.rejects(rpc('dabbir_ceo_command_create_authorized_v1',[delegate,'Attempt global command','P1',null,[],null]),/DABBIR_GLOBAL_SCOPE_REQUIRED/);
 await assert.rejects(rpc('dabbir_ceo_command_update_authorized_v1',[delegate,a,'cancel',null,null,null]),/DABBIR_GLOBAL_SCOPE_REQUIRED/);
});
test('audit joins existing sources and filters business and actor scope',async()=>{
 await db.exec(`insert into public.dabbir_platform_owner_audit(id,business_id,action,outcome,created_at) values(gen_random_uuid(),'${a}','product_edit','SUCCESS',now()),(gen_random_uuid(),'${b}','hidden_edit','SUCCESS',now());
 insert into dabbir_private.platform_customer_admin_audit(id,actor_user_id,action,created_at) values(gen_random_uuid(),'${root}','owner_decision_resolved',now());`);
 const all=await rpc('dabbir_platform_audit_list_v1',[root,100]),scoped=await rpc('dabbir_platform_audit_list_v1',[delegate,100]);
 assert.equal(new Set(all.map(row=>row.source)).size,3);assert.ok(scoped.some(row=>row.action==='product_edit'));assert.ok(!scoped.some(row=>['hidden_edit','owner_decision_resolved'].includes(row.action)));
});
test('changed SECURITY DEFINER functions remain inaccessible to browser roles',async()=>{
 const result=await db.query("select p.proname,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') authenticated,has_function_privilege('service_role',p.oid,'execute') server from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('dabbir_platform_command_center_overview_v1','dabbir_platform_customer_360_scoped_v2','dabbir_platform_feedback_list_v1','dabbir_platform_support_action_v2','dabbir_platform_audit_list_v1','dabbir_ceo_commands_authorized_v1','dabbir_ceo_command_create_authorized_v1','dabbir_ceo_command_update_authorized_v1')");
 assert.equal(result.rows.length,8);for(const row of result.rows){assert.equal(row.anon,false,row.proname);assert.equal(row.authenticated,false,row.proname);assert.equal(row.server,true,row.proname)}
});
test('rollback restores original definitions without dropping tables or records',async()=>{
 const before=(await db.query('select count(*) n from dabbir_private.platform_customer_support_cases')).rows[0].n;
 await db.exec(await read('supabase/rollback/20260907110000_owner_dashboard_consolidation.sql'));
 assert.equal((await db.query('select count(*) n from dabbir_private.platform_customer_support_cases')).rows[0].n,before);
 await db.exec(await read('supabase/migrations/20260907110000_owner_dashboard_consolidation.sql'));
 assert.equal((await rpc('dabbir_platform_command_center_overview_v1',[delegate])).customers.accounts,1);
});
