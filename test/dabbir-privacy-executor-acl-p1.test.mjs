import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const MIGRATION_URL = new URL('../supabase/migrations/20260913074000_fix_customer_privacy_executor_acl.sql', import.meta.url);

const OWNER_A='11111111-1111-4111-8111-111111111111';
const OWNER_B='22222222-2222-4222-8222-222222222222';
const OUTSIDER='33333333-3333-4333-8333-333333333333';
const BIZ_A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BIZ_B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CUSTOMER_EXPORT='aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const CUSTOMER_DELETE='aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa';
const CUSTOMER_HOLD='aaaaaaaa-3333-4333-8333-aaaaaaaaaaaa';
const CUSTOMER_CROSS='bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb';
const REQ_EXPORT='eeeeeeee-1111-4111-8111-eeeeeeeeeeee';
const REQ_DELETE='eeeeeeee-2222-4222-8222-eeeeeeeeeeee';
const REQ_HOLD='eeeeeeee-3333-4333-8333-eeeeeeeeeeee';
const REQ_CROSS='ffffffff-1111-4111-8111-ffffffffffff';

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
language sql immutable as $$ select decode(repeat('00',64),'hex') $$;

create table public.dabbir_memberships(business_id uuid,user_id uuid,role text,status text);
create table public.dabbir_retention_policies(business_id uuid,policy_state text,data_category text);
create table public.dabbir_customers(id uuid primary key,business_id uuid not null,display_name text not null default 'Demo Customer');
create table public.dabbir_privacy_requests(
 id uuid primary key,business_id uuid not null,customer_id uuid,request_type text not null,status text not null default 'REQUESTED',
 requested_by uuid,correlation_id text,request_scope jsonb not null default '{}'::jsonb,result_ref text,requested_at timestamptz not null default now(),
 completed_at timestamptz,created_at timestamptz not null default now(),target_ref_hash text,execution_summary jsonb not null default '{}'::jsonb
);
create table public.dabbir_privacy_audit(business_id uuid,actor_user_id uuid,action text,target_type text,target_id text,privacy_request_id uuid,correlation_id text,metadata jsonb);
create table public.dabbir_customer_evidence(business_id uuid,customer_id uuid);
create table public.dabbir_handoffs(business_id uuid,customer_id uuid,conversation_id uuid);
create table public.dabbir_followups(business_id uuid,customer_id uuid,conversation_id uuid);
create table public.dabbir_message_batches(business_id uuid,customer_id uuid,conversation_id uuid);
create table public.dabbir_messages(business_id uuid,conversation_id uuid);
create table public.dabbir_conversations(id uuid primary key,business_id uuid,customer_id uuid);
create table public.dabbir_appointments(business_id uuid,customer_id uuid);
create table public.dabbir_customer_identities(business_id uuid,customer_id uuid);
create table public.dabbir_customer_management(business_id uuid,customer_id uuid);
create table public.dabbir_customer_memory(business_id uuid,customer_id uuid);
create table public.dabbir_customer_consents(business_id uuid,customer_id uuid);
create table public.dabbir_verification_challenges(business_id uuid,customer_id uuid);
create table public.dabbir_event_inbox(business_id uuid,customer_id uuid);
create table public.dabbir_orders(business_id uuid,customer_id uuid);
create table public.dabbir_offers(payer_customer_id uuid,creator_business_id uuid,advertiser_business_id uuid);
create table public.dabbir_payments(payer_customer_id uuid,stripe_customer_id text,recipient_business_id uuid,payer_business_id uuid);
create table public.dabbir_financial_evidence(business_id uuid,customer_id uuid,conversation_id uuid,metadata jsonb not null default '{}'::jsonb);

create or replace function dabbir_private.dabbir_execute_customer_privacy_request(p_request_id uuid, p_confirmation text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid := auth.uid();
  v_req public.dabbir_privacy_requests%rowtype;
  v_export jsonb;
  v_hash text;
  v_confirmation_expected text;
  v_summary jsonb;
  v_conversation_ids uuid[] := '{}'::uuid[];
  v_count bigint;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_req from public.dabbir_privacy_requests r where r.id=p_request_id for update;
  if not found then raise exception 'PRIVACY_REQUEST_NOT_FOUND'; end if;
  if v_req.request_type not in ('CUSTOMER_EXPORT','CUSTOMER_DELETE') then raise exception 'CUSTOMER_PRIVACY_REQUEST_REQUIRED'; end if;
  if v_req.customer_id is null then raise exception 'CUSTOMER_TARGET_ALREADY_REMOVED'; end if;
  if not exists(select 1 from public.dabbir_memberships m where m.business_id=v_req.business_id and m.user_id=v_user and m.status='active' and m.role='owner') then raise exception 'OWNER_REQUIRED'; end if;
  if v_req.status not in ('REQUESTED','REVIEW_REQUIRED','APPROVED','FAILED') then raise exception 'PRIVACY_REQUEST_NOT_EXECUTABLE'; end if;

  if v_req.request_type='CUSTOMER_EXPORT' then
    v_export:=jsonb_build_object('business_id',v_req.business_id,'customer_id',v_req.customer_id,'synthetic',true);
    v_hash:=encode(extensions.digest(convert_to(v_export::text,'UTF8'),'sha256'),'hex');
    v_summary:=jsonb_build_object('mode','INLINE_EXPORT','sha256',v_hash,'bytes',octet_length(v_export::text),'customer_id_present',true);
    update public.dabbir_privacy_requests set status='COMPLETED',completed_at=now(),result_ref='sha256:'||v_hash,execution_summary=v_summary where id=v_req.id;
    insert into public.dabbir_privacy_audit(business_id,actor_user_id,action,target_type,target_id,privacy_request_id,correlation_id,metadata)
    values(v_req.business_id,v_user,'customer_export_completed','customer',v_req.customer_id::text,v_req.id,v_req.correlation_id,jsonb_build_object('sha256',v_hash,'bytes',octet_length(v_export::text),'persisted_export_body',false));
    return jsonb_build_object('ok',true,'request_id',v_req.id,'request_type',v_req.request_type,'sha256',v_hash,'export',v_export);
  end if;

  if exists(select 1 from public.dabbir_retention_policies rp where rp.business_id=v_req.business_id and rp.policy_state='LEGAL_HOLD' and rp.data_category in ('CUSTOMER_PROFILE','CUSTOMER_IDENTITY','CONVERSATION','MESSAGE','APPOINTMENT')) then raise exception 'LEGAL_HOLD_ACTIVE'; end if;
  v_confirmation_expected:='DELETE_CUSTOMER:'||v_req.customer_id::text;
  if coalesce(p_confirmation,'')<>v_confirmation_expected then raise exception 'EXPLICIT_DELETE_CONFIRMATION_REQUIRED'; end if;

  v_hash:=encode(extensions.digest(convert_to(v_req.business_id::text||':'||v_req.customer_id::text,'UTF8'),'sha256'),'hex');
  select coalesce(array_agg(c.id),'{}'::uuid[]) into v_conversation_ids from public.dabbir_conversations c where c.business_id=v_req.business_id and c.customer_id=v_req.customer_id;
  v_summary:=jsonb_build_object('mode','ERASE_PERSONAL_DATA_DISSOCIATE_FINANCIAL','target_ref_hash',v_hash,'conversation_count',cardinality(v_conversation_ids),'financial_records_retained',true);

  update public.dabbir_privacy_requests set status='CANCELLED',customer_id=null,target_ref_hash=v_hash,execution_summary=execution_summary||jsonb_build_object('cancelled_due_to_customer_deletion',true) where business_id=v_req.business_id and customer_id=v_req.customer_id and id<>v_req.id;
  update public.dabbir_privacy_requests set status='PROCESSING',customer_id=null,target_ref_hash=v_hash,execution_summary=v_summary where id=v_req.id;

  delete from public.dabbir_customer_evidence where business_id=v_req.business_id and customer_id=v_req.customer_id;
  delete from public.dabbir_handoffs where business_id=v_req.business_id and (customer_id=v_req.customer_id or conversation_id=any(v_conversation_ids));
  delete from public.dabbir_followups where business_id=v_req.business_id and (customer_id=v_req.customer_id or conversation_id=any(v_conversation_ids));
  delete from public.dabbir_message_batches where business_id=v_req.business_id and (customer_id=v_req.customer_id or conversation_id=any(v_conversation_ids));
  delete from public.dabbir_messages where business_id=v_req.business_id and conversation_id=any(v_conversation_ids);
  delete from public.dabbir_conversations where business_id=v_req.business_id and customer_id=v_req.customer_id;
  delete from public.dabbir_appointments where business_id=v_req.business_id and customer_id=v_req.customer_id;
  delete from public.dabbir_customer_identities where business_id=v_req.business_id and customer_id=v_req.customer_id;
  delete from public.dabbir_customer_management where business_id=v_req.business_id and customer_id=v_req.customer_id;
  delete from public.dabbir_customer_memory where business_id=v_req.business_id and customer_id=v_req.customer_id;
  delete from public.dabbir_customer_consents where business_id=v_req.business_id and customer_id=v_req.customer_id;
  delete from public.dabbir_verification_challenges where business_id=v_req.business_id and customer_id=v_req.customer_id;
  delete from public.dabbir_event_inbox where business_id=v_req.business_id and customer_id=v_req.customer_id;
  update public.dabbir_orders set customer_id=null where business_id=v_req.business_id and customer_id=v_req.customer_id;
  update public.dabbir_offers set payer_customer_id=null where payer_customer_id=v_req.customer_id and (creator_business_id=v_req.business_id or advertiser_business_id=v_req.business_id);
  update public.dabbir_payments set payer_customer_id=null,stripe_customer_id=null where payer_customer_id=v_req.customer_id and (recipient_business_id=v_req.business_id or payer_business_id=v_req.business_id);
  update public.dabbir_financial_evidence set customer_id=null,conversation_id=null,metadata=jsonb_build_object('privacy_redacted',true,'redacted_at',now()) where business_id=v_req.business_id and customer_id=v_req.customer_id;

  delete from public.dabbir_customers where business_id=v_req.business_id and id=v_req.customer_id;
  get diagnostics v_count = row_count;
  if v_count<>1 then raise exception 'CUSTOMER_DELETE_NOT_VERIFIED'; end if;

  update public.dabbir_privacy_requests set status='COMPLETED',completed_at=now(),result_ref='erased:'||v_hash,execution_summary=v_summary where id=v_req.id;
  insert into public.dabbir_privacy_audit(business_id,actor_user_id,action,target_type,target_id,privacy_request_id,correlation_id,metadata)
  values(v_req.business_id,v_user,'customer_delete_completed','customer_hash',v_hash,v_req.id,v_req.correlation_id,jsonb_build_object('financial_records_retained',true,'external_money_side_effects',false,'target_ref_hash',v_hash));

  return jsonb_build_object('ok',true,'request_id',v_req.id,'request_type',v_req.request_type,'deleted',true,'target_ref_hash',v_hash,'financial_records_retained',true);
end;
$$;

create or replace function public.dabbir_execute_customer_privacy_request(p_request_id uuid,p_confirmation text default null)
returns jsonb language sql set search_path='' as $$
  select dabbir_private.dabbir_execute_customer_privacy_request(p_request_id,p_confirmation);
$$;

revoke all on function dabbir_private.dabbir_execute_customer_privacy_request(uuid,text) from public,anon,authenticated,service_role;
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

test('P1 #750 isolated ACL contract: baseline fails, least-privilege grant restores authorized flow and preserves denials', async()=>{
  const db=new PGlite();
  try {
    await db.exec(schemaSql);

    const baseline=await expectError(
      ()=>asUser(db,OWNER_A,`select public.dabbir_execute_customer_privacy_request('${REQ_EXPORT}',null)`),
      /permission denied.*dabbir_execute_customer_privacy_request/i,
    );
    assert.ok(String(baseline.code||'')==='42501'||/permission denied/i.test(String(baseline.message||'')));

    const migration=fs.readFileSync(MIGRATION_URL,'utf8');
    await db.exec(migration);

    const exportResult=await asUser(db,OWNER_A,`select public.dabbir_execute_customer_privacy_request('${REQ_EXPORT}',null) as result`);
    assert.equal(exportResult.rows[0].result.ok,true);
    assert.equal(exportResult.rows[0].result.request_type,'CUSTOMER_EXPORT');
    assert.equal(exportResult.rows[0].result.export.business_id,BIZ_A);
    assert.equal(exportResult.rows[0].result.export.customer_id,CUSTOMER_EXPORT);

    const deleteResult=await asUser(db,OWNER_A,`select public.dabbir_execute_customer_privacy_request('${REQ_DELETE}','DELETE_CUSTOMER:${CUSTOMER_DELETE}') as result`);
    assert.equal(deleteResult.rows[0].result.ok,true);
    assert.equal(deleteResult.rows[0].result.deleted,true);
    const deleted=await db.query(`select count(*)::int as n from public.dabbir_customers where id='${CUSTOMER_DELETE}'`);
    assert.equal(deleted.rows[0].n,0);

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

test('P1 #750 migration is narrowly scoped and does not elevate the public wrapper',()=>{
  const migration=fs.readFileSync(MIGRATION_URL,'utf8');
  assert.match(migration,/grant\s+execute\s+on\s+function\s+dabbir_private\.dabbir_execute_customer_privacy_request\(uuid,text\)\s+to\s+authenticated/i);
  assert.doesNotMatch(migration,/security\s+definer/i);
  assert.doesNotMatch(migration,/grant\s+usage\s+on\s+schema/i);
  assert.doesNotMatch(migration,/to\s+service_role/i);
  assert.doesNotMatch(migration,/alter\s+table|disable\s+row\s+level\s+security|bypassrls/i);
});
