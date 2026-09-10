-- Run only after the reviewed Coexistence authority migration is installed.
-- Synthetic identities, real deployed functions/constraints/triggers, one transaction.
-- No Meta call, real phone, real user, committed fixture or bypassed database gate.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';
set local request.jwt.claim.role = 'service_role';
do $proof$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  branch_a uuid := gen_random_uuid(); branch_b uuid := gen_random_uuid();
  phone_a text := 'architecture-proof-' || a::text;
  phone_b text := 'architecture-proof-' || b::text;
  customer_a uuid; customer_b uuid; conversation_a uuid; message_a uuid;
  batch_id uuid; result jsonb; row_result record; fn text;
begin
  insert into public.dabbir_businesses(id,slug,name,business_type,demo_mode)
  values (a,'architecture-coex-proof-'||a::text,'DABBIR AI QA Architecture Coexistence A','services',true),
         (b,'architecture-coex-proof-'||b::text,'DABBIR AI QA Architecture Coexistence B','services',true);
  insert into public.dabbir_business_branches(id,business_id,name,is_primary)
  values(branch_a,a,'Proof A',true),(branch_b,b,'Proof B',true);
  insert into public.dabbir_whatsapp_connections(
    business_id,branch_id,waba_id,phone_number_id,status,last_verified_at,
    access_token_ciphertext,access_token_iv,access_token_tag,connected_by,token_context_id)
  values(a,branch_a,phone_a,phone_a,'connected',now(),'synthetic-not-a-token','synthetic','synthetic',gen_random_uuid(),a),
        (b,branch_b,phone_b,phone_b,'connected',now(),'synthetic-not-a-token','synthetic','synthetic',gen_random_uuid(),b);
  insert into public.dabbir_customers(business_id,display_name,phone_e164,display_name_source,metadata)
  values(a,'Owner fixture label','+000000000000001','owner','{"display_name_owner_override":true}') returning id into customer_a;

  -- Existing phone-only owner identity must be reused by contact, history and text/voice resolver.
  result := public.dabbir_whatsapp_apply_coexistence_contact_sync(phone_a,'000000000000001','Provider fixture','add');
  if (result->>'customer_id')::uuid is distinct from customer_a then raise exception 'PROOF_CONTACT_IDENTITY'; end if;
  select * into row_result from public.dabbir_whatsapp_persist_coexistence_message(
    phone_a,'architecture-history-'||a,'000000000000001','Provider fixture','Synthetic history','inbound','history');
  if row_result.customer_id is distinct from customer_a or row_result.duplicate then raise exception 'PROOF_HISTORY_IDENTITY'; end if;
  conversation_a := row_result.conversation_id; message_a := row_result.message_id;
  if dabbir_private.resolve_whatsapp_customer_v1(a,'000000000000001','Updated fixture') is distinct from customer_a then raise exception 'PROOF_RESOLVER_IDENTITY'; end if;
  if not exists(select 1 from public.dabbir_customers c where c.id=customer_a and c.business_id=a
    and c.display_name='Owner fixture label' and c.display_name_source='owner' and c.whatsapp_display_name='Updated fixture') then raise exception 'PROOF_OWNER_NAME'; end if;
  if (select count(*) from public.dabbir_customers c where c.business_id=a)<>1 then raise exception 'PROOF_CUSTOMER_DUPLICATION'; end if;

  -- Same provider ID/handle is independently scoped by the receiving tenant.
  select * into row_result from public.dabbir_whatsapp_persist_coexistence_message(
    phone_b,'architecture-history-'||a,'000000000000001','Other fixture','Synthetic history','inbound','history');
  customer_b := row_result.customer_id;
  if customer_b=customer_a or row_result.business_id<>b or row_result.conversation_id=conversation_a then raise exception 'PROOF_TENANT_ISOLATION'; end if;
  if not exists(select 1 from public.dabbir_conversations c where c.id=row_result.conversation_id and c.business_id=b and c.branch_id=branch_b) then raise exception 'PROOF_BRANCH_ISOLATION'; end if;
  select * into row_result from public.dabbir_whatsapp_persist_coexistence_message(
    phone_a,'architecture-history-'||a,'000000000000001','Provider fixture','Replay','inbound','history');
  if row_result.duplicate is not true or row_result.message_id<>message_a then raise exception 'PROOF_REPLAY'; end if;
  if exists(select 1 from public.dabbir_message_batches q where q.business_id in(a,b)) then raise exception 'PROOF_HISTORY_ENQUEUED_AI'; end if;

  -- App echo must cancel queued work while preserving an active human takeover.
  insert into public.dabbir_message_batches(business_id,conversation_id,customer_id,channel_type,state,lock_token)
  values(a,conversation_a,customer_a,'whatsapp','READY',gen_random_uuid()) returning id into batch_id;
  insert into public.dabbir_handoffs(business_id,conversation_id,customer_id,route_class,reason,state)
  values(a,conversation_a,customer_a,'SUPPORT','Architecture verification','HUMAN_ACTIVE');
  update public.dabbir_conversations c set state='human_active' where c.business_id=a and c.id=conversation_a;
  perform public.dabbir_whatsapp_persist_coexistence_message(
    phone_a,'architecture-echo-'||a,'000000000000001','Provider fixture','Synthetic app reply','outbound','smb_message_echoes');
  if not exists(select 1 from public.dabbir_message_batches q where q.id=batch_id and q.business_id=a and q.state='CANCELLED' and q.lock_token is null) then raise exception 'PROOF_ECHO_CANCEL'; end if;
  if not exists(select 1 from public.dabbir_conversations c where c.id=conversation_a and c.business_id=a and c.state='human_active') then raise exception 'PROOF_HUMAN_OWNERSHIP'; end if;

  -- Split phone/handle identity and non-service roles remain fail-closed.
  insert into public.dabbir_customers(business_id,display_name,phone_e164)
  values(a,'Split phone fixture','+000000000000002');
  insert into public.dabbir_customers(business_id,display_name,channel_handle,phone_e164)
  values(a,'Split handle fixture','000000000000002','+000000000000003');
  begin
    perform public.dabbir_whatsapp_apply_coexistence_contact_sync(phone_a,'000000000000002','Fixture','add');
    raise exception 'PROOF_EXPECTED_IDENTITY_REJECTION';
  exception when unique_violation then
    if sqlerrm<>'WHATSAPP_CUSTOMER_IDENTITY_CONFLICT' then raise; end if;
  end;
  perform set_config('request.jwt.claim.role','authenticated',true);
  begin
    perform public.dabbir_whatsapp_apply_coexistence_contact_sync(phone_a,'000000000000001','Fixture','add');
    raise exception 'PROOF_EXPECTED_ROLE_REJECTION';
  exception when raise_exception then
    if sqlerrm<>'SERVICE_ROLE_REQUIRED' then raise; end if;
  end;
  perform set_config('request.jwt.claim.role','service_role',true);
  foreach fn in array array[
    'public.dabbir_whatsapp_apply_coexistence_contact_sync(text,text,text,text,timestamptz)',
    'public.dabbir_whatsapp_persist_coexistence_message(text,text,text,text,text,text,text,timestamptz)'] loop
    if has_function_privilege('anon',fn,'EXECUTE') or has_function_privilege('authenticated',fn,'EXECUTE')
      or not has_function_privilege('service_role',fn,'EXECUTE') then raise exception 'PROOF_RPC_PRIVILEGES'; end if;
  end loop;
  if not (select relrowsecurity from pg_class where oid='public.dabbir_customers'::regclass) then raise exception 'PROOF_RLS_RETAINED'; end if;
end;
$proof$;
rollback;
select 'COEXISTENCE_DEPLOYED_CONTRACT_PASS' as verification,
  'SYNTHETIC_DATABASE_ONLY_NO_META' as evidence_scope,
  (select count(*) from public.dabbir_businesses where slug like 'architecture-coex-proof-%') as remaining_fixture_businesses;
