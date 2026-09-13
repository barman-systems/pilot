import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const MIGRATION_URL = new URL('../supabase/migrations/20260913074000_fix_customer_privacy_executor_acl.sql', import.meta.url);
const CANONICAL_PRIVACY_URL = new URL('../supabase/migrations/20260827162000_dabbir_customer_privacy_executor_v1.sql', import.meta.url);

const OWNER_A='11111111-1111-4111-8111-111111111111';
const OWNER_B='22222222-2222-4222-8222-222222222222';
const OUTSIDER='33333333-3333-4333-8333-333333333333';
const BIZ_A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BIZ_B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CUSTOMER_EXPORT='aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const CUSTOMER_DELETE='aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa';
const CUSTOMER_HOLD='aaaaaaaa-3333-4333-8333-aaaaaaaaaaaa';
const CUSTOMER_CROSS='bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb';
const CONV_EXPORT='aaaaaaaa-4444-4111-8111-aaaaaaaaaaaa';
const REQ_EXPORT='eeeeeeee-1111-4111-8111-eeeeeeeeeeee';
const REQ_DELETE='eeeeeeee-2222-4222-8222-eeeeeeeeeeee';
const REQ_HOLD='eeeeeeee-3333-4333-8111-eeeeeeeeeeee';
const REQ_CROSS='ffffffff-1111-4111-8111-ffffffffffff';

const canonicalPrivacyMigration=fs.readFileSync(CANONICAL_PRIVACY_URL,'utf8');

function extractFunction(sql,marker){
  const start=sql.indexOf(marker);
  assert.notEqual(start,-1,`canonical function marker missing: ${marker}`);
  const end=sql.indexOf('\n$$;',start);
  assert.notEqual(end,-1,`canonical function terminator missing: ${marker}`);
  return sql.slice(start,end+'\n$$;'.length);
}

const canonicalExportHelper=extractFunction(
  canonicalPrivacyMigration,
  'create or replace function dabbir_private.dabbir_customer_export_payload(',
);
const canonicalExecutor=extractFunction(
  canonicalPrivacyMigration,
  'create or replace function dabbir_private.dabbir_execute_customer_privacy_request(',
);

const schemaSql=String.raw`
create role authenticated nologin;
create role anon nologin;
create role service_role nologin;
create schema auth;
create schema dabbir_private;
create schema extensions;
grant usage on schema public,dabbir_private,auth to authenticated;

create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;

create function extensions.digest(data bytea, algorithm text) returns bytea
language sql immutable as $$ select decode(repeat('00',32),'hex') $$;

create table public.dabbir_memberships(business_id uuid,user_id uuid,role text,status text);
create table public.dabbir_retention_policies(business_id uuid,policy_state text,data_category text);
create table public.dabbir_customers(
  id uuid primary key,business_id uuid not null,display_name text not null default 'Demo Customer',created_at timestamptz not null default now()
);
create table public.dabbir_privacy_requests(
 id uuid primary key,business_id uuid not null,customer_id uuid,request_type text not null,status text not null default 'REQUESTED',
 requested_by uuid,correlation_id text,request_scope jsonb not null default '{}'::jsonb,result_ref text,requested_at timestamptz not null default now(),
 completed_at timestamptz,created_at timestamptz not null default now(),target_ref_hash text,execution_summary jsonb not null default '{}'::jsonb
);
create table public.dabbir_privacy_audit(business_id uuid,actor_user_id uuid,action text,target_type text,target_id text,privacy_request_id uuid,correlation_id text,metadata jsonb);
create table public.dabbir_customer_evidence(business_id uuid,customer_id uuid,created_at timestamptz not null default now());
create table public.dabbir_handoffs(business_id uuid,customer_id uuid,conversation_id uuid,created_at timestamptz not null default now());
create table public.dabbir_followups(business_id uuid,customer_id uuid,conversation_id uuid,created_at timestamptz not null default now());
create table public.dabbir_message_batches(business_id uuid,customer_id uuid,conversation_id uuid);
create table public.dabbir_messages(business_id uuid,conversation_id uuid,created_at timestamptz not null default now());
create table public.dabbir_conversations(id uuid primary key,business_id uuid,customer_id uuid,created_at timestamptz not null default now());
create table public.dabbir_appointments(business_id uuid,customer_id uuid,created_at timestamptz not null default now());
create table public.dabbir_customer_identities(business_id uuid,customer_id uuid,created_at timestamptz not null default now());
create table public.dabbir_customer_management(business_id uuid,customer_id uuid);
create table public.dabbir_customer_memory(business_id uuid,customer_id uuid,created_at timestamptz not null default now());
create table public.dabbir_customer_consents(business_id uuid,customer_id uuid,created_at timestamptz not null default now());
create table public.dabbir_verification_challenges(business_id uuid,customer_id uuid);
create table public.dabbir_event_inbox(business_id uuid,customer_id uuid);
create table public.dabbir_orders(business_id uuid,customer_id uuid,created_at timestamptz not null default now());
create table public.dabbir_offers(payer_customer_id uuid,creator_business_id uuid,advertiser_business_id uuid,created_at timestamptz not null default now());
create table public.dabbir_payments(payer_customer_id uuid,stripe_customer_id text,recipient_business_id uuid,payer_business_id uuid,created_at timestamptz not null default now());
create table public.dabbir_financial_evidence(
  business_id uuid,customer_id uuid,conversation_id uuid,metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now()
);
`;

const boundaryAndFixtures=String.raw`
revoke all on function dabbir_private.dabbir_customer_export_payload(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function dabbir_private.dabbir_execute_customer_privacy_request(uuid,text) from public,anon,authenticated,service_role;

create or replace function public.dabbir_execute_customer_privacy_request(p_request_id uuid,p_confirmation text default null)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select dabbir_private.dabbir_execute_customer_privacy_request(p_request_id,p_confirmation);
$$;
revoke all on function public.dabbir_execute_customer_privacy_request(uuid,text) from public,anon;
grant execute on function public.dabbir_execute_customer_privacy_request(uuid,text) to authenticated,service_role;
grant select on public.dabbir_privacy_requests,public.dabbir_memberships to authenticated;

insert into public.dabbir_memberships values
('${BIZ_A}','${OWNER_A}','owner','active'),
('${BIZ_B}','${OWNER_B}','owner','active');
insert into public.dabbir_customers(id,business_id,display_name) values
('${CUSTOMER_EXPORT}','${BIZ_A}','ACL750 Export'),
('${CUSTOMER_DELETE}','${BIZ_A}','ACL750 Delete'),
('${CUSTOMER_HOLD}','${BIZ_A}','ACL750 Hold'),
('${CUSTOMER_CROSS}','${BIZ_B}','ACL750 Cross');
insert into public.dabbir_conversations(id,business_id,customer_id) values
('${CONV_EXPORT}','${BIZ_A}','${CUSTOMER_EXPORT}');
insert into public.dabbir_messages(business_id,conversation_id) values
('${BIZ_A}','${CONV_EXPORT}');
insert into public.dabbir_customer_identities(business_id,customer_id) values
('${BIZ_A}','${CUSTOMER_EXPORT}');
insert into public.dabbir_financial_evidence(business_id,customer_id,metadata) values
('${BIZ_A}','${CUSTOMER_DELETE}',jsonb_build_object('fixture','retained-financial'));
insert into public.dabbir_privacy_requests(id,business_id,customer_id,request_type,status,requested_by,correlation_id) values
('${REQ_EXPORT}','${BIZ_A}','${CUSTOMER_EXPORT}','CUSTOMER_EXPORT','REQUESTED','${OWNER_A}','acl750-export'),
('${REQ_DELETE}','${BIZ_A}','${CUSTOMER_DELETE}','CUSTOMER_DELETE','REQUESTED','${OWNER_A}','acl750-delete'),
('${REQ_HOLD}','${BIZ_A}','${CUSTOMER_HOLD}','CUSTOMER_DELETE','REQUESTED','${OWNER_A}','acl750-hold'),
('${REQ_CROSS}','${BIZ_B}','${CUSTOMER_CROSS}','CUSTOMER_EXPORT','REQUESTED','${OWNER_B}','acl750-cross');
`;

async function asUser(db,userId,sql,params=[]){
  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${userId}',false);`);
  try { return await db.query(sql,params); }
  finally { await db.exec('reset role;'); }
}

async function expectError(action,pattern){
  let thrown=null;
  try { await action(); } catch(error){ thrown=error; }
  assert.ok(thrown,'expected database error');
  assert.match(String(thrown.message||thrown),pattern);
  return thrown;
}

test('P1 #750 isolated ACL contract uses the canonical privacy executor and export payload', async()=>{
  const db=new PGlite();
  try {
    await db.exec(schemaSql);
    await db.exec(canonicalExportHelper);
    await db.exec(canonicalExecutor);
    await db.exec(boundaryAndFixtures);

    const baseline=await expectError(
      ()=>asUser(db,OWNER_A,`select public.dabbir_execute_customer_privacy_request('${REQ_EXPORT}',null)`),
      /permission denied.*dabbir_execute_customer_privacy_request/i,
    );
    assert.ok(String(baseline.code||'')==='42501'||/permission denied/i.test(String(baseline.message||'')));

    const migration=fs.readFileSync(MIGRATION_URL,'utf8');
    await db.exec(migration);

    const exportResult=await asUser(db,OWNER_A,`select public.dabbir_execute_customer_privacy_request('${REQ_EXPORT}',null) as result`);
    const exported=exportResult.rows[0].result;
    assert.equal(exported.ok,true);
    assert.equal(exported.request_type,'CUSTOMER_EXPORT');
    assert.equal(exported.export.schema_version,'dabbir_customer_export_v1');
    assert.equal(exported.export.business_id,BIZ_A);
    assert.equal(exported.export.customer_id,CUSTOMER_EXPORT);
    assert.equal(exported.export.customer.id,CUSTOMER_EXPORT);
    assert.equal(exported.export.conversations.length,1);
    assert.equal(exported.export.messages.length,1);
    assert.equal(exported.export.identities.length,1);
    assert.equal(Object.hasOwn(exported.export,'synthetic'),false);

    const persistedExport=await db.query(`select status,result_ref,execution_summary from public.dabbir_privacy_requests where id='${REQ_EXPORT}'`);
    assert.equal(persistedExport.rows[0].status,'COMPLETED');
    assert.match(persistedExport.rows[0].result_ref,/^sha256:[0-9a-f]{64}$/);
    assert.equal(persistedExport.rows[0].execution_summary.mode,'INLINE_EXPORT');
    assert.equal(Object.hasOwn(persistedExport.rows[0].execution_summary,'export'),false);

    await expectError(
      ()=>asUser(db,OWNER_A,`select dabbir_private.dabbir_customer_export_payload('${BIZ_A}','${CUSTOMER_EXPORT}')`),
      /permission denied.*dabbir_customer_export_payload/i,
    );

    const deleteResult=await asUser(db,OWNER_A,`select public.dabbir_execute_customer_privacy_request('${REQ_DELETE}','DELETE_CUSTOMER:${CUSTOMER_DELETE}') as result`);
    assert.equal(deleteResult.rows[0].result.ok,true);
    assert.equal(deleteResult.rows[0].result.deleted,true);
    const deleted=await db.query(`select count(*)::int as n from public.dabbir_customers where id='${CUSTOMER_DELETE}'`);
    assert.equal(deleted.rows[0].n,0);
    const retainedFinancial=await db.query(`select customer_id,conversation_id,metadata from public.dabbir_financial_evidence where business_id='${BIZ_A}'`);
    assert.equal(retainedFinancial.rows.length,1);
    assert.equal(retainedFinancial.rows[0].customer_id,null);
    assert.equal(retainedFinancial.rows[0].conversation_id,null);
    assert.equal(retainedFinancial.rows[0].metadata.privacy_redacted,true);

    await expectError(
      ()=>asUser(db,OUTSIDER,`select public.dabbir_execute_customer_privacy_request('${REQ_EXPORT}',null)`),
      /OWNER_REQUIRED/,
    );
    await expectError(
      ()=>asUser(db,OWNER_A,`select public.dabbir_execute_customer_privacy_request('${REQ_CROSS}',null)`),
      /OWNER_REQUIRED/,
    );
    await expectError(
      ()=>asUser(db,OUTSIDER,`select dabbir_private.dabbir_execute_customer_privacy_request('${REQ_EXPORT}',null)`),
      /OWNER_REQUIRED/,
    );
    await expectError(
      ()=>asUser(db,OWNER_A,`select dabbir_private.dabbir_execute_customer_privacy_request('${REQ_CROSS}',null)`),
      /OWNER_REQUIRED/,
    );

    await db.exec(`insert into public.dabbir_retention_policies values ('${BIZ_A}','LEGAL_HOLD','CUSTOMER_PROFILE')`);
    await expectError(
      ()=>asUser(db,OWNER_A,`select dabbir_private.dabbir_execute_customer_privacy_request('${REQ_HOLD}','DELETE_CUSTOMER:${CUSTOMER_HOLD}')`),
      /LEGAL_HOLD_ACTIVE/,
    );
  } finally {
    await db.close();
  }
});

test('P1 #750 fixture is source-derived from the canonical BAR-16 privacy migration',()=>{
  assert.match(canonicalExportHelper,/schema_version','dabbir_customer_export_v1'/i);
  assert.match(canonicalExecutor,/dabbir_private\.dabbir_customer_export_payload\(v_req\.business_id,v_req\.customer_id\)/i);
  assert.doesNotMatch(canonicalExecutor,/synthetic/i);
});

test('P1 #750 migration is narrowly scoped and does not elevate the public wrapper',()=>{
  const migration=fs.readFileSync(MIGRATION_URL,'utf8');
  assert.match(migration,/grant\s+execute\s+on\s+function\s+dabbir_private\.dabbir_execute_customer_privacy_request\(uuid,text\)\s+to\s+authenticated/i);
  assert.doesNotMatch(migration,/security\s+definer/i);
  assert.doesNotMatch(migration,/grant\s+usage\s+on\s+schema/i);
  assert.doesNotMatch(migration,/to\s+service_role/i);
  assert.doesNotMatch(migration,/alter\s+table|disable\s+row\s+level\s+security|bypassrls/i);
});
