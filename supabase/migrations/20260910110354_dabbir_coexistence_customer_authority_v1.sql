-- Coexistence uses the existing text/voice customer identity authority.
-- Proven defect: a phone-only owner customer fails the old handle-only upsert
-- with SQLSTATE 23505. No customer backfill, deletion, grant expansion or
-- signature/connection/ledger contracts are unchanged. Ambiguous tenant
-- columns in echo/mutation updates are explicitly qualified (SQLSTATE 42702).
-- Existing public function signatures remain stable for all callers.
CREATE OR REPLACE FUNCTION public.dabbir_whatsapp_persist_coexistence_message(p_phone_number_id text, p_provider_message_id text, p_customer_handle text, p_display_name text, p_body text, p_direction text, p_source_field text, p_occurred_at timestamp with time zone DEFAULT now())
 RETURNS TABLE(business_id uuid, connection_id uuid, customer_id uuid, conversation_id uuid, message_id uuid, duplicate boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dabbir_private', 'auth'
AS $function$
declare
  v_connection public.dabbir_whatsapp_connections%rowtype;
  v_existing public.dabbir_whatsapp_event_ledger%rowtype;
  v_customer_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_handle text:=regexp_replace(coalesce(p_customer_handle,''),'[^0-9]','','g');
  v_provider text:=trim(coalesce(p_provider_message_id,''));
  v_direction text:=lower(trim(coalesce(p_direction,'')));
  v_source text:=lower(trim(coalesce(p_source_field,'')));
  v_body text:=left(trim(coalesce(p_body,'')),4000);
  v_pending record;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if nullif(trim(p_phone_number_id),'') is null then raise exception 'WHATSAPP_PHONE_NUMBER_ID_REQUIRED'; end if;
  if length(v_provider) not between 3 and 320 then raise exception 'WHATSAPP_PROVIDER_MESSAGE_ID_REQUIRED'; end if;
  if length(v_handle) not between 7 and 20 then raise exception 'WHATSAPP_CUSTOMER_HANDLE_REQUIRED'; end if;
  if v_direction not in ('inbound','outbound') then raise exception 'WHATSAPP_COEXISTENCE_DIRECTION_INVALID'; end if;
  if v_source not in ('history','smb_message_echoes') then raise exception 'WHATSAPP_COEXISTENCE_SOURCE_INVALID'; end if;
  if v_body='' then v_body:='[WhatsApp message]'; end if;

  select * into v_connection from public.dabbir_whatsapp_connections c
   where c.phone_number_id=trim(p_phone_number_id) and c.status='connected' limit 1 for update;
  if not found then raise exception 'WHATSAPP_TENANT_CONNECTION_NOT_FOUND'; end if;
  if v_connection.branch_id is null then raise exception 'WHATSAPP_CONNECTION_BRANCH_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_connection.business_id::text||':wa-provider:'||v_provider,0));
  select * into v_existing from public.dabbir_whatsapp_event_ledger e
   where e.business_id=v_connection.business_id and e.provider_message_id=v_provider
   order by e.created_at asc limit 1;
  if found then
    return query select v_existing.business_id,v_existing.connection_id,
      (select c.customer_id from public.dabbir_conversations c where c.id=v_existing.conversation_id),
      v_existing.conversation_id,v_existing.message_id,true;
    return;
  end if;

  v_customer_id:=dabbir_private.resolve_whatsapp_customer_v1(v_connection.business_id,v_handle,p_display_name);
  update public.dabbir_customers c
     set metadata=coalesce(c.metadata,'{}'::jsonb)||jsonb_build_object('coexistence',true),updated_at=now()
   where c.id=v_customer_id and c.business_id=v_connection.business_id;

  select c.id into v_conversation_id from public.dabbir_conversations c
   where c.business_id=v_connection.business_id and c.customer_id=v_customer_id
     and c.branch_id=v_connection.branch_id and c.channel_type='whatsapp' and c.demo_mode=false and c.state<>'closed'
   order by c.updated_at desc limit 1 for update;
  if v_conversation_id is null then
    insert into public.dabbir_conversations(business_id,customer_id,channel_type,state,demo_mode,branch_id)
    values(v_connection.business_id,v_customer_id,'whatsapp','waiting_customer',false,v_connection.branch_id)
    returning id into v_conversation_id;
  end if;

  insert into public.dabbir_messages(business_id,conversation_id,sender_type,body,intent,simulated,created_at)
  values(v_connection.business_id,v_conversation_id,case when v_direction='inbound' then 'customer' else 'human' end,
    v_body,case when v_source='history' then 'WHATSAPP_HISTORY_SYNC' else 'WHATSAPP_APP_ECHO' end,false,coalesce(p_occurred_at,now()))
  returning id into v_message_id;

  insert into public.dabbir_whatsapp_event_ledger(
    business_id,connection_id,event_key,direction,event_type,provider_message_id,conversation_id,message_id,
    provider_status,provider_verified,occurred_at,verified_at,evidence
  ) values(
    v_connection.business_id,v_connection.id,'coexistence:'||v_source||':'||v_provider,v_direction,'message',v_provider,
    v_conversation_id,v_message_id,'received',true,coalesce(p_occurred_at,now()),now(),
    jsonb_build_object('source','meta_signed_webhook','signature_verified',true,'coexistence',true,'source_field',v_source,'historical',v_source='history')
  );

  if v_source='smb_message_echoes' and v_direction='outbound' then
    update public.dabbir_message_batches b
       set state='CANCELLED',last_error='SUPERSEDED_BY_WHATSAPP_BUSINESS_APP_REPLY',
           lock_token=null,locked_until=null,updated_at=now()
     where b.business_id=v_connection.business_id and b.conversation_id=v_conversation_id
       and b.state in ('OPEN','READY','RETRY');
    update public.dabbir_conversations c
       set state=case when exists(
         select 1 from public.dabbir_handoffs h
          where h.business_id=c.business_id and h.conversation_id=c.id
            and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE')
       ) then c.state else 'waiting_customer' end,
       updated_at=now()
     where c.business_id=v_connection.business_id and c.id=v_conversation_id;
  end if;

  for v_pending in
    select m.* from public.dabbir_whatsapp_coexistence_mutations m
     where m.business_id=v_connection.business_id and m.original_provider_message_id=v_provider and m.applied_at is null
     order by m.occurred_at asc,m.created_at asc
  loop
    update public.dabbir_messages
       set body=case when v_pending.mutation_type='revoke' then '[WhatsApp message revoked]' else left(coalesce(nullif(trim(v_pending.new_body),''),'[WhatsApp message edited]'),4000) end
     where id=v_message_id and public.dabbir_messages.business_id=v_connection.business_id;
    update public.dabbir_whatsapp_coexistence_mutations set applied_at=now(),updated_at=now() where id=v_pending.id;
  end loop;

  update public.dabbir_whatsapp_connections
     set coexistence_mode='coexistence',
         coexistence_message_echo_at=case when v_source='smb_message_echoes' then coalesce(p_occurred_at,now()) else coexistence_message_echo_at end,
         coexistence_last_event_at=greatest(coalesce(coexistence_last_event_at,'epoch'::timestamptz),coalesce(p_occurred_at,now())),
         updated_at=now()
   where id=v_connection.id;

  return query select v_connection.business_id,v_connection.id,v_customer_id,v_conversation_id,v_message_id,false;
end;
$function$;


CREATE OR REPLACE FUNCTION public.dabbir_whatsapp_apply_coexistence_contact_sync(p_phone_number_id text, p_customer_handle text, p_display_name text, p_action text, p_occurred_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_connection public.dabbir_whatsapp_connections%rowtype;
  v_handle text:=regexp_replace(coalesce(p_customer_handle,''),'[^0-9]','','g');
  v_action text:=lower(trim(coalesce(p_action,'add')));
  v_customer uuid;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if length(v_handle) not between 7 and 20 then raise exception 'WHATSAPP_CUSTOMER_HANDLE_REQUIRED'; end if;
  if v_action not in ('add','remove') then raise exception 'WHATSAPP_CONTACT_SYNC_ACTION_INVALID'; end if;
  select * into v_connection from public.dabbir_whatsapp_connections c
   where c.phone_number_id=trim(p_phone_number_id) and c.status='connected' limit 1 for update;
  if not found then raise exception 'WHATSAPP_TENANT_CONNECTION_NOT_FOUND'; end if;

  if v_action='add' then
    v_customer:=dabbir_private.resolve_whatsapp_customer_v1(v_connection.business_id,v_handle,p_display_name);
    update public.dabbir_customers c
       set metadata=(coalesce(c.metadata,'{}'::jsonb)||jsonb_build_object('coexistence_contact',true,'whatsapp_app_contact_removed',false)) - 'whatsapp_app_contact_removed_at',
           updated_at=now()
     where c.id=v_customer and c.business_id=v_connection.business_id;
  else
    update public.dabbir_customers
       set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('whatsapp_app_contact_removed',true,'whatsapp_app_contact_removed_at',coalesce(p_occurred_at,now())),updated_at=now()
     where business_id=v_connection.business_id and channel_handle=v_handle
     returning id into v_customer;
  end if;

  update public.dabbir_whatsapp_connections
     set coexistence_mode='coexistence',coexistence_contacts_synced_at=coalesce(p_occurred_at,now()),
         coexistence_last_event_at=greatest(coalesce(coexistence_last_event_at,'epoch'::timestamptz),coalesce(p_occurred_at,now())),updated_at=now()
   where id=v_connection.id;
  return jsonb_build_object('applied',true,'customer_id',v_customer,'action',v_action);
end;
$function$;


revoke all on function public.dabbir_whatsapp_persist_coexistence_message(text,text,text,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_persist_coexistence_message(text,text,text,text,text,text,text,timestamptz) to service_role;
revoke all on function public.dabbir_whatsapp_apply_coexistence_contact_sync(text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_apply_coexistence_contact_sync(text,text,text,text,timestamptz) to service_role;
