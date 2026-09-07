-- Fix invalid aggregate ordering in WhatsApp AI context.
-- PostgreSQL rejects ORDER BY k.updated_at outside the aggregate query when the
-- selected expression is an aggregate. Limit first in a subquery, then aggregate.

create or replace function public.dabbir_whatsapp_ai_context(p_batch_id uuid,p_lock_token uuid)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $function$
declare
  v_batch public.dabbir_message_batches%rowtype;
  v_conversation public.dabbir_conversations%rowtype;
  v_business public.dabbir_businesses%rowtype;
  v_customer public.dabbir_customers%rowtype;
  v_state public.dabbir_ai_conversation_state%rowtype;
  v_newer boolean:=false;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into v_batch from public.dabbir_message_batches where id=p_batch_id and state='PROCESSING' and lock_token=p_lock_token;
  if not found then raise exception 'AI_BATCH_LOCK_MISMATCH'; end if;
  select * into v_conversation from public.dabbir_conversations where id=v_batch.conversation_id and business_id=v_batch.business_id;
  if not found then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;
  select * into v_business from public.dabbir_businesses where id=v_batch.business_id;
  select * into v_customer from public.dabbir_customers where id=v_conversation.customer_id and business_id=v_batch.business_id;
  select * into v_state from public.dabbir_ai_conversation_state where business_id=v_batch.business_id and conversation_id=v_batch.conversation_id and (expires_at is null or expires_at>now());

  select exists(
    select 1 from public.dabbir_messages m
    where m.business_id=v_batch.business_id and m.conversation_id=v_batch.conversation_id
      and m.sender_type='customer' and m.simulated=false and m.created_at>v_batch.last_message_at
  ) into v_newer;

  return jsonb_build_object(
    'batch',jsonb_build_object('id',v_batch.id,'business_id',v_batch.business_id,'conversation_id',v_batch.conversation_id,'customer_id',v_batch.customer_id,'message_count',v_batch.message_count,'attempt_count',v_batch.attempt_count,'last_message_at',v_batch.last_message_at),
    'conversation',jsonb_build_object('id',v_conversation.id,'state',v_conversation.state,'channel_type',v_conversation.channel_type,'newer_customer_message_exists',v_newer),
    'business',jsonb_build_object('id',v_business.id,'name',v_business.name,'business_type',v_business.business_type,'locale',v_business.locale,'country_code',v_business.country_code,'currency_code',v_business.currency_code,'timezone',v_business.timezone),
    'customer',jsonb_build_object('id',v_customer.id,'display_name',v_customer.display_name,'phone_e164',v_customer.phone_e164,'channel_handle',v_customer.channel_handle),
    'pending_state',case when v_state.conversation_id is null then null else jsonb_build_object('pending_action',v_state.pending_action,'payload',v_state.payload,'expires_at',v_state.expires_at) end,
    'batch_messages',coalesce((
      select jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'created_at',m.created_at) order by i.ordinal)
      from public.dabbir_message_batch_items i join public.dabbir_messages m on m.id=i.message_id and m.business_id=i.business_id
      where i.batch_id=v_batch.id
    ),'[]'::jsonb),
    'history',coalesce((
      select jsonb_agg(x.obj order by x.created_at) from (
        select jsonb_build_object('sender_type',m.sender_type,'body',m.body,'created_at',m.created_at) obj,m.created_at
        from public.dabbir_messages m where m.business_id=v_batch.business_id and m.conversation_id=v_batch.conversation_id and m.id not in (select message_id from public.dabbir_message_batch_items where batch_id=v_batch.id)
        order by m.created_at desc limit 10
      ) x
    ),'[]'::jsonb),
    'services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'name_ar',s.name_ar,'name_en',s.name_en,'duration_minutes',s.duration_minutes,'price',s.price_aed) order by s.name) from public.dabbir_services s where s.business_id=v_batch.business_id and s.active),'[]'::jsonb),
    'workers',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'display_name',w.display_name,'job_title',w.job_title) order by w.display_name) from public.dabbir_workers w where w.business_id=v_batch.business_id and w.status='active'),'[]'::jsonb),
    'worker_services',coalesce((select jsonb_agg(jsonb_build_object('worker_id',ws.worker_id,'service_id',ws.service_id,'duration_minutes',ws.duration_minutes,'price',ws.price_aed)) from public.dabbir_worker_services ws where ws.business_id=v_batch.business_id and ws.active),'[]'::jsonb),
    'upcoming_appointments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'service_id',a.service_id,'worker_id',a.worker_id,'starts_at',a.starts_at,'ends_at',a.ends_at,'status',a.status,'confirmation_gate',a.confirmation_gate,'deposit_required_amount',a.deposit_required_amount,'deposit_currency_code',a.deposit_currency_code) order by a.starts_at) from public.dabbir_appointments a where a.business_id=v_batch.business_id and a.customer_id=v_customer.id and a.starts_at>=now() and a.status not in ('cancelled','completed','no_show') limit 10),'[]'::jsonb),
    'knowledge',coalesce((
      select jsonb_agg(jsonb_build_object('key',x.knowledge_key,'type',x.knowledge_type,'value',x.value,'source',x.source,'confidence',x.confidence) order by x.updated_at desc)
      from (
        select k.knowledge_key,k.knowledge_type,k.value,k.source,k.confidence,k.updated_at
        from public.dabbir_business_knowledge k
        where k.business_id=v_batch.business_id and (k.status is null or lower(k.status) in ('active','verified','approved'))
        order by k.updated_at desc
        limit 20
      ) x
    ),'[]'::jsonb)
  );
end;
$function$;

revoke all on function public.dabbir_whatsapp_ai_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_context(uuid,uuid) to service_role;
