-- One human-handoff operation for every Conversation Brain channel.
create or replace function public.dabbir_ai_handoff(
  p_business_id uuid,p_conversation_id uuid,p_route_class text default 'SUPPORT',
  p_reason text default 'Customer requested human assistance',p_summary text default ''
) returns jsonb language plpgsql security definer set search_path='pg_catalog','public','auth' as $function$
declare
  v_conversation public.dabbir_conversations%rowtype;
  v_handoff public.dabbir_handoffs%rowtype;
  v_route text:=upper(trim(coalesce(p_route_class,'SUPPORT')));
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if v_route not in ('SALES','SUPPORT','BOOKING','RETURNS','COMPLAINT','OWNER_DECISION') then v_route:='SUPPORT'; end if;
  select * into v_conversation from public.dabbir_conversations c
   where c.business_id=p_business_id and c.id=p_conversation_id
     and c.channel_type in ('whatsapp','web') and c.demo_mode=false and c.state<>'closed' for update;
  if not found then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;
  select * into v_handoff from public.dabbir_handoffs h
   where h.business_id=p_business_id and h.conversation_id=p_conversation_id
     and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE') order by h.created_at desc limit 1 for update;
  if not found then
    insert into public.dabbir_handoffs(
      business_id,conversation_id,customer_id,route_class,reason,state,priority,routing_strategy,
      summary,attempted_actions,unresolved_items,metadata
    ) values(
      p_business_id,p_conversation_id,v_conversation.customer_id,v_route,
      left(coalesce(p_reason,'Customer requested human assistance'),500),'QUEUED',70,'least_open',
      left(coalesce(p_summary,''),1200),'[]'::jsonb,'[]'::jsonb,
      jsonb_build_object('source','dabbir_ai','channel_type',v_conversation.channel_type,'customer_requested_human',p_reason='CUSTOMER_REQUESTED_HUMAN')
    ) returning * into v_handoff;
  end if;
  update public.dabbir_conversations set state='action_required',updated_at=now()
   where business_id=p_business_id and id=p_conversation_id;
  perform public.dabbir_whatsapp_ai_set_state(
    p_business_id,p_conversation_id,'handoff',jsonb_build_object('handoff_id',v_handoff.id,'route_class',v_handoff.route_class),3600
  );
  return jsonb_build_object('ok',true,'verified',true,'handoff_id',v_handoff.id,'state',v_handoff.state,'route_class',v_handoff.route_class);
end;$function$;
revoke all on function public.dabbir_ai_handoff(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_ai_handoff(uuid,uuid,text,text,text) to service_role;

-- Compatibility wrapper keeps the historical WhatsApp contract for old callers.
create or replace function public.dabbir_whatsapp_ai_handoff(
  p_business_id uuid,p_conversation_id uuid,p_route_class text default 'SUPPORT',
  p_reason text default 'Customer requested human assistance',p_summary text default ''
) returns jsonb language plpgsql security definer set search_path='pg_catalog','public','auth' as $function$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if not exists(select 1 from public.dabbir_conversations c where c.business_id=p_business_id and c.id=p_conversation_id and c.channel_type='whatsapp' and not c.demo_mode) then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;
  return public.dabbir_ai_handoff(p_business_id,p_conversation_id,p_route_class,p_reason,p_summary);
end;$function$;
revoke all on function public.dabbir_whatsapp_ai_handoff(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_ai_handoff(uuid,uuid,text,text,text) to service_role;
