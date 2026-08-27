-- DABBIR Owner Decision Memory runtime v1
-- The only v1 learned execution is suppressing the exact repeated LOW-priority OWNER_DECISION handoff.

create or replace function dabbir_private.dabbir_owner_policy_skip_handoff(p_business_id uuid,p_route_class text,p_reason text,p_priority integer)
returns uuid language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_reason text:=lower(trim(coalesce(p_reason,'')));v_bounds jsonb;v_match record;
begin
 if auth.uid() is null then return null; end if;
 if upper(coalesce(p_route_class,''))<>'OWNER_DECISION' or coalesce(p_priority,100)>40 then return null; end if;
 if length(v_reason)<3 or length(v_reason)>120 then return null; end if;
 if v_reason ~ '(payment|refund|payout|withdraw|transfer|billing|invoice|legal|kyc|identity|bank|discount|price|money|cash|tax|vat)' then return null; end if;
 v_bounds:=jsonb_build_object('route_class','OWNER_DECISION','reason',v_reason,'max_priority',40);
 select * into v_match from dabbir_private.dabbir_match_owner_policy(p_business_id,'handoff.owner_decision.continue_ai',v_bounds) limit 1;
 if not found or v_match.decision_key<>'behavior' or v_match.decision_value<>'continue_with_ai' then return null; end if;
 insert into public.dabbir_owner_policy_audit(business_id,policy_id,actor_user_id,event_type,action_key,policy_version,match_reason,safe_metadata)
 values(p_business_id,v_match.policy_id,auth.uid(),'MATCHED','handoff.owner_decision.continue_ai',v_match.policy_version,'exact_low_priority_handoff_match',jsonb_build_object('reason',v_reason,'priority',p_priority));
 insert into public.dabbir_owner_policy_audit(business_id,policy_id,actor_user_id,event_type,action_key,policy_version,match_reason,safe_metadata)
 values(p_business_id,v_match.policy_id,auth.uid(),'EXECUTED','handoff.owner_decision.continue_ai',v_match.policy_version,'owner_approved_continue_with_ai',jsonb_build_object('external_side_effects',false,'handoff_created',false));
 return v_match.policy_id;
end;$$;
revoke all on function dabbir_private.dabbir_owner_policy_skip_handoff(uuid,text,text,integer) from public,anon;
grant execute on function dabbir_private.dabbir_owner_policy_skip_handoff(uuid,text,text,integer) to authenticated,service_role;

create or replace function public.dabbir_create_handoff(
 p_business_id uuid,p_conversation_id uuid,p_customer_id uuid,p_route_class text,p_reason text,p_priority integer default 50,
 p_routing_strategy text default 'least_open',p_summary text default '',p_attempted_actions jsonb default '[]'::jsonb,p_unresolved_items jsonb default '[]'::jsonb
) returns uuid language plpgsql security invoker set search_path='public','pg_temp' as $$
declare v_id uuid;v_policy_id uuid;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if not dabbir_private.has_permission(p_business_id,'manage_handoffs') then raise exception 'HANDOFF_MANAGEMENT_REQUIRED'; end if;
 if p_route_class not in('SALES','SUPPORT','BOOKING','RETURNS','COMPLAINT','OWNER_DECISION') then raise exception 'INVALID_HANDOFF_ROUTE'; end if;
 if p_routing_strategy not in('least_open','round_robin','skill','priority') then raise exception 'INVALID_ROUTING_STRATEGY'; end if;
 if not exists(select 1 from public.dabbir_conversations c where c.id=p_conversation_id and c.business_id=p_business_id) then raise exception 'CONVERSATION_NOT_IN_BUSINESS'; end if;
 if p_customer_id is not null and not exists(select 1 from public.dabbir_customers c where c.id=p_customer_id and c.business_id=p_business_id) then raise exception 'CUSTOMER_NOT_IN_BUSINESS'; end if;
 v_policy_id:=dabbir_private.dabbir_owner_policy_skip_handoff(p_business_id,p_route_class,p_reason,greatest(0,least(100,p_priority)));
 if v_policy_id is not null then return null; end if;
 insert into public.dabbir_handoffs(business_id,conversation_id,customer_id,route_class,reason,priority,routing_strategy,summary,attempted_actions,unresolved_items)
 values(p_business_id,p_conversation_id,p_customer_id,p_route_class,left(coalesce(p_reason,''),240),greatest(0,least(100,p_priority)),p_routing_strategy,left(coalesce(p_summary,''),1200),coalesce(p_attempted_actions,'[]'::jsonb),coalesce(p_unresolved_items,'[]'::jsonb))
 on conflict(business_id,conversation_id) where state in('QUEUED','ASSIGNED','HUMAN_ACTIVE') do update set route_class=excluded.route_class,reason=excluded.reason,priority=greatest(public.dabbir_handoffs.priority,excluded.priority),summary=excluded.summary,attempted_actions=excluded.attempted_actions,unresolved_items=excluded.unresolved_items,updated_at=now() returning id into v_id;
 update public.dabbir_conversations set state='action_required',updated_at=now() where id=p_conversation_id and business_id=p_business_id and state<>'human_active';
 return v_id;
end;$$;
revoke all on function public.dabbir_create_handoff(uuid,uuid,uuid,text,text,integer,text,text,jsonb,jsonb) from public,anon;
grant execute on function public.dabbir_create_handoff(uuid,uuid,uuid,text,text,integer,text,text,jsonb,jsonb) to authenticated;

create or replace function public.dabbir_return_conversation_to_ai(p_business_id uuid,p_conversation_id uuid)
returns jsonb language plpgsql security invoker set search_path='public','pg_temp' as $$
declare v_now timestamptz:=now();v_role text;v_handoff public.dabbir_handoffs%rowtype;v_reason text;v_bounds jsonb;v_human_reply_exists boolean:=false;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if not dabbir_private.has_permission(p_business_id,'reply_conversations') then raise exception 'REPLY_PERMISSION_REQUIRED'; end if;
 if not dabbir_private.has_permission(p_business_id,'manage_handoffs') then raise exception 'HANDOFF_MANAGEMENT_REQUIRED'; end if;
 if not exists(select 1 from public.dabbir_conversations c where c.id=p_conversation_id and c.business_id=p_business_id) then raise exception 'CONVERSATION_NOT_FOUND'; end if;
 select m.role into v_role from public.dabbir_memberships m where m.business_id=p_business_id and m.user_id=auth.uid() and m.status='active' limit 1;
 select h.* into v_handoff from public.dabbir_handoffs h where h.business_id=p_business_id and h.conversation_id=p_conversation_id and h.state in('QUEUED','ASSIGNED','HUMAN_ACTIVE') order by h.updated_at desc limit 1 for update;
 if found and v_role='owner' and v_handoff.route_class='OWNER_DECISION' and coalesce(v_handoff.priority,100)<=40 then
  v_reason:=lower(trim(coalesce(v_handoff.reason,'')));
  select exists(select 1 from public.dabbir_messages msg where msg.business_id=p_business_id and msg.conversation_id=p_conversation_id and msg.sender_type='human' and msg.created_at>=coalesce(v_handoff.human_active_at,v_handoff.assigned_at,v_handoff.created_at)) into v_human_reply_exists;
  if not v_human_reply_exists and length(v_reason) between 3 and 120 and v_reason !~ '(payment|refund|payout|withdraw|transfer|billing|invoice|legal|kyc|identity|bank|discount|price|money|cash|tax|vat)' then
   v_bounds:=jsonb_build_object('route_class','OWNER_DECISION','reason',v_reason,'max_priority',40);
   perform dabbir_private.dabbir_record_owner_decision(p_business_id,'handoff.owner_decision.continue_ai','behavior','continue_with_ai','LOW',v_bounds,'return_to_ai',v_handoff.id);
  end if;
 end if;
 update public.dabbir_handoffs set state='RETURNED_TO_AI',returned_to_ai_at=v_now,updated_at=v_now where business_id=p_business_id and conversation_id=p_conversation_id and state in('QUEUED','ASSIGNED','HUMAN_ACTIVE');
 update public.dabbir_conversations set state='waiting_customer',updated_at=v_now where id=p_conversation_id and business_id=p_business_id;
 return jsonb_build_object('ok',true,'conversation_id',p_conversation_id,'state','waiting_customer');
end;$$;
revoke all on function public.dabbir_return_conversation_to_ai(uuid,uuid) from public,anon;
grant execute on function public.dabbir_return_conversation_to_ai(uuid,uuid) to authenticated;
