-- DABBIR BAR-16 customer privacy executor v1
-- Customer export is returned inline and only a hash is persisted.
-- Customer deletion is an explicit owner-only second step, blocks on LEGAL_HOLD,
-- erases customer-scoped personal content, and dissociates retained financial records.

alter table public.dabbir_privacy_requests
  add column if not exists target_ref_hash text,
  add column if not exists execution_summary jsonb not null default '{}'::jsonb;

alter table public.dabbir_privacy_requests
  drop constraint if exists dabbir_privacy_requests_target_ref_hash_check;
alter table public.dabbir_privacy_requests
  add constraint dabbir_privacy_requests_target_ref_hash_check
  check (target_ref_hash is null or target_ref_hash ~ '^[0-9a-f]{64}$');

alter table public.dabbir_privacy_requests
  drop constraint if exists dabbir_privacy_requests_execution_summary_check;
alter table public.dabbir_privacy_requests
  add constraint dabbir_privacy_requests_execution_summary_check
  check (jsonb_typeof(execution_summary)='object' and octet_length(execution_summary::text)<=16384);

alter table public.dabbir_privacy_requests
  drop constraint if exists dabbir_privacy_requests_scope_check;
alter table public.dabbir_privacy_requests
  add constraint dabbir_privacy_requests_scope_check check (
    (request_type in ('BUSINESS_EXPORT','BUSINESS_DELETE') and customer_id is null)
    or
    (request_type in ('CUSTOMER_EXPORT','CUSTOMER_DELETE') and (
      customer_id is not null
      or (
        customer_id is null
        and target_ref_hash is not null
        and status in ('PROCESSING','COMPLETED','REJECTED','FAILED','CANCELLED')
      )
    ))
  );

create or replace function dabbir_private.dabbir_customer_export_payload(
  p_business_id uuid,
  p_customer_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_payload jsonb;
begin
  if not exists (
    select 1 from public.dabbir_customers c
    where c.business_id=p_business_id and c.id=p_customer_id
  ) then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;

  select jsonb_build_object(
    'schema_version','dabbir_customer_export_v1',
    'exported_at',now(),
    'business_id',p_business_id,
    'customer_id',p_customer_id,
    'customer',(select to_jsonb(c) from public.dabbir_customers c where c.business_id=p_business_id and c.id=p_customer_id),
    'identities',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.dabbir_customer_identities x where x.business_id=p_business_id and x.customer_id=p_customer_id),'[]'::jsonb),
    'management',coalesce((select jsonb_agg(to_jsonb(x)) from public.dabbir_customer_management x where x.business_id=p_business_id and x.customer_id=p_customer_id),'[]'::jsonb),
    'memory',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.dabbir_customer_memory x where x.business_id=p_business_id and x.customer_id=p_customer_id),'[]'::jsonb),
    'conversations',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.dabbir_conversations x where x.business_id=p_business_id and x.customer_id=p_customer_id),'[]'::jsonb),
    'messages',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at) from public.dabbir_messages m where m.business_id=p_business_id and exists(select 1 from public.dabbir_conversations c where c.id=m.conversation_id and c.business_id=p_business_id and c.customer_id=p_customer_id)),'[]'::jsonb),
    'appointments',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.dabbir_appointments x where x.business_id=p_business_id and x.customer_id=p_customer_id),'[]'::jsonb),
    'handoffs',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.dabbir_handoffs x where x.business_id=p_business_id and x.customer_id=p_customer_id),'[]'::jsonb),
    'followups',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.dabbir_followups x where x.business_id=p_business_id and x.customer_id=p_customer_id),'[]'::jsonb),
    'consents',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.dabbir_customer_consents x where x.business_id=p_business_id and x.customer_id=p_customer_id),'[]'::jsonb),
    'orders',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.dabbir_orders x where x.business_id=p_business_id and x.customer_id=p_customer_id),'[]'::jsonb),
    'offers',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.dabbir_offers x where x.payer_customer_id=p_customer_id and (x.creator_business_id=p_business_id or x.advertiser_business_id=p_business_id)),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.dabbir_payments x where x.payer_customer_id=p_customer_id and (x.recipient_business_id=p_business_id or x.payer_business_id=p_business_id)),'[]'::jsonb),
    'financial_evidence',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.dabbir_financial_evidence x where x.business_id=p_business_id and x.customer_id=p_customer_id),'[]'::jsonb),
    'customer_evidence',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.dabbir_customer_evidence x where x.business_id=p_business_id and x.customer_id=p_customer_id),'[]'::jsonb)
  ) into v_payload;

  if octet_length(v_payload::text)>5242880 then raise exception 'CUSTOMER_EXPORT_TOO_LARGE'; end if;
  return v_payload;
end;
$$;
revoke all on function dabbir_private.dabbir_customer_export_payload(uuid,uuid) from public,anon,authenticated;

create or replace function dabbir_private.dabbir_execute_customer_privacy_request(
  p_request_id uuid,
  p_confirmation text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
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
    v_export:=dabbir_private.dabbir_customer_export_payload(v_req.business_id,v_req.customer_id);
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

revoke all on function dabbir_private.dabbir_execute_customer_privacy_request(uuid,text) from public,anon;
grant execute on function dabbir_private.dabbir_execute_customer_privacy_request(uuid,text) to authenticated;

create or replace function public.dabbir_execute_customer_privacy_request(p_request_id uuid,p_confirmation text default null)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select dabbir_private.dabbir_execute_customer_privacy_request(p_request_id,p_confirmation);
$$;
revoke all on function public.dabbir_execute_customer_privacy_request(uuid,text) from public,anon;
grant execute on function public.dabbir_execute_customer_privacy_request(uuid,text) to authenticated;

comment on function public.dabbir_execute_customer_privacy_request(uuid,text) is
'Owner-only BAR-16 executor. CUSTOMER_EXPORT returns data inline without persisting the body. CUSTOMER_DELETE requires DELETE_CUSTOMER:<uuid> confirmation and fails under LEGAL_HOLD.';
