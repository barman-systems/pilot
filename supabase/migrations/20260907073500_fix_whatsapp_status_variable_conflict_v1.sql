-- Fix PL/pgSQL output-column ambiguity discovered by live Meta status callbacks.
create or replace function public.dabbir_whatsapp_apply_status(p_phone_number_id text,p_provider_message_id text,p_status text,p_occurred_at timestamptz default now()) returns table(matched boolean,provider_verified boolean,conversation_id uuid,message_id uuid,reservation_state text) language plpgsql security definer set search_path='' as $function$
#variable_conflict use_column
declare v_connection public.dabbir_whatsapp_connections%rowtype; v_res public.dabbir_whatsapp_outbound_reservations%rowtype; v_status text:=lower(trim(coalesce(p_status,''))); v_verified boolean; v_next_state text; v_status_key text;
begin
 if nullif(trim(p_phone_number_id),'') is null or nullif(trim(p_provider_message_id),'') is null then raise exception 'WHATSAPP_STATUS_CONTEXT_REQUIRED'; end if;
 if v_status not in ('sent','delivered','read','failed','deleted') then raise exception 'WHATSAPP_STATUS_INVALID'; end if;
 select * into v_connection from public.dabbir_whatsapp_connections c where c.phone_number_id=trim(p_phone_number_id) and c.status='connected' limit 1;
 if not found then return query select false,false,null::uuid,null::uuid,null::text; return; end if;
 select * into v_res from public.dabbir_whatsapp_outbound_reservations r where r.business_id=v_connection.business_id and r.provider_message_id=trim(p_provider_message_id) for update;
 if not found then return query select false,false,null::uuid,null::uuid,null::text; return; end if;
 v_verified:=v_status in ('delivered','read');
 v_next_state:=case v_status when 'sent' then 'SENT' when 'delivered' then 'DELIVERED' when 'read' then 'READ' else 'FAILED' end;
 update public.dabbir_whatsapp_outbound_reservations r set state=case when r.state='READ' then 'READ' when r.state='DELIVERED' and v_next_state='SENT' then 'DELIVERED' when r.state in ('DELIVERED','READ') and v_next_state='FAILED' then r.state else v_next_state end, provider_status=v_status, provider_verified=r.provider_verified or v_verified, verified_at=case when v_verified then coalesce(r.verified_at,now()) else r.verified_at end, error_code=case when v_next_state='FAILED' then 'META_OUTBOUND_'||upper(v_status) else null end, updated_at=now() where r.id=v_res.id returning r.state into v_next_state;
 update public.dabbir_whatsapp_event_ledger e set provider_status=v_status, provider_verified=e.provider_verified or v_verified, verified_at=case when v_verified then coalesce(e.verified_at,now()) else e.verified_at end, updated_at=now(), evidence=coalesce(e.evidence,'{}'::jsonb)||jsonb_build_object('status_source','meta_signed_webhook') where e.business_id=v_res.business_id and e.event_key='outbound:'||trim(p_provider_message_id);
 v_status_key:='status:'||trim(p_provider_message_id)||':'||v_status||':'||extract(epoch from coalesce(p_occurred_at,now()))::bigint::text;
 insert into public.dabbir_whatsapp_event_ledger(business_id,connection_id,event_key,direction,event_type,provider_message_id,conversation_id,message_id,provider_status,provider_verified,occurred_at,verified_at,evidence) values(v_res.business_id,v_res.connection_id,v_status_key,'status','status',trim(p_provider_message_id),v_res.conversation_id,v_res.message_id,v_status,v_verified,coalesce(p_occurred_at,now()),case when v_verified then now() else null end,jsonb_build_object('source','meta_signed_webhook','reservation_id',v_res.id)) on conflict (business_id,event_key) do nothing;
 update public.dabbir_whatsapp_connections c set last_verified_at=case when v_verified then now() else c.last_verified_at end,last_provider_status=200,last_error=case when v_next_state='FAILED' then 'META_OUTBOUND_'||upper(v_status) else null end,updated_at=now() where c.id=v_connection.id;
 return query select true,v_verified,v_res.conversation_id,v_res.message_id,v_next_state;
end;$function$;
revoke all on function public.dabbir_whatsapp_apply_status(text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_apply_status(text,text,text,timestamptz) to service_role;
