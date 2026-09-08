-- Preserve owner-only approval and tenant checks while enforcing the canonical
-- account/membership suspension gate inside both privileged RPCs.
-- CREATE OR REPLACE preserves existing function ownership and EXECUTE grants.
-- The already-applied Understanding V2 migration remains immutable.

create or replace function public.dabbir_knowledge_propose_v2(p_business_id uuid,p_conversation_id uuid,p_correction_id uuid,p_entity_type text,p_alias text,p_target_id uuid) returns jsonb
language plpgsql security definer set search_path='pg_catalog','public','auth' as $$
declare pid uuid; u uuid:=auth.uid();
begin
  if not coalesce(dabbir_private.is_active_member(p_business_id),false) or
     not exists(select 1 from public.dabbir_memberships m where m.business_id=p_business_id and m.user_id=u and m.role='owner' and m.status='active') then raise exception 'OWNER_REQUIRED'; end if;
  if p_entity_type not in ('service','worker','branch') then raise exception 'KNOWLEDGE_ENTITY_UNSUPPORTED'; end if;
  if (p_entity_type='service' and not exists(select 1 from public.dabbir_services where id=p_target_id and business_id=p_business_id and active)) or
     (p_entity_type='worker' and not exists(select 1 from public.dabbir_workers where id=p_target_id and business_id=p_business_id and status='active')) or
     (p_entity_type='branch' and not exists(select 1 from public.dabbir_business_branches where id=p_target_id and business_id=p_business_id and status='active')) then raise exception 'KNOWLEDGE_TARGET_SCOPE_INVALID'; end if;
  if p_conversation_id is not null and not exists(select 1 from public.dabbir_conversations where id=p_conversation_id and business_id=p_business_id) then raise exception 'KNOWLEDGE_SOURCE_SCOPE_INVALID'; end if;
  if p_correction_id is not null and not exists(select 1 from public.dabbir_messages where id=p_correction_id and conversation_id=p_conversation_id and business_id=p_business_id and sender_type='human' and sender_user_id=u) then raise exception 'KNOWLEDGE_CORRECTION_SCOPE_INVALID'; end if;
  if char_length(trim(p_alias)) not between 1 and 80 or p_alias ~* '(token|secret|password|api.key|ignore.instructions|انس تعليمات)' then raise exception 'KNOWLEDGE_ALIAS_INVALID'; end if;
  insert into public.dabbir_ai_knowledge_proposals(business_id,source_conversation_id,source_correction_id,entity_type,alias,target_id,created_by)
    values(p_business_id,p_conversation_id,p_correction_id,p_entity_type,trim(p_alias),p_target_id,u) returning id into pid;
  insert into public.dabbir_ai_understanding_events(business_id,conversation_id,proposal_id,event_type,version,actor_id)
    values(p_business_id,p_conversation_id,pid,'PROPOSED',1,u);
  return jsonb_build_object('id',pid,'status','PROPOSED','active',false);
end $$;

create or replace function public.dabbir_knowledge_review_v2(p_business_id uuid,p_proposal_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='pg_catalog','public','auth' as $$
declare k public.dabbir_ai_knowledge_proposals%rowtype; v bigint; u uuid:=auth.uid(); st text; key text;
begin
  if not coalesce(dabbir_private.is_active_member(p_business_id),false) or
     not exists(select 1 from public.dabbir_memberships m where m.business_id=p_business_id and m.user_id=u and m.role='owner' and m.status='active') then raise exception 'OWNER_REQUIRED'; end if;
  if p_action not in ('approve','reject','revoke','rollback') then raise exception 'KNOWLEDGE_REVIEW_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('understanding-knowledge:'||p_business_id::text,0));
  select * into k from public.dabbir_ai_knowledge_proposals where id=p_proposal_id and business_id=p_business_id for update;
  if not found then raise exception 'KNOWLEDGE_PROPOSAL_NOT_FOUND'; end if;
  if (p_action='approve' and k.status<>'PROPOSED') or (p_action='rollback' and k.status not in ('SUPERSEDED','REVOKED')) or (p_action='revoke' and k.status<>'OWNER_APPROVED') or (p_action='reject' and k.status<>'PROPOSED') then raise exception 'KNOWLEDGE_TRANSITION_INVALID'; end if;
  if p_action in ('approve','rollback') then
    if (k.entity_type='service' and not exists(select 1 from public.dabbir_services where business_id=p_business_id and id=k.target_id and active)) or
       (k.entity_type='worker' and not exists(select 1 from public.dabbir_workers where business_id=p_business_id and id=k.target_id and status='active')) or
       (k.entity_type='branch' and not exists(select 1 from public.dabbir_business_branches where business_id=p_business_id and id=k.target_id and status='active')) then raise exception 'KNOWLEDGE_TARGET_SCOPE_INVALID'; end if;
  end if;
  select coalesce(max(version),0)+1 into v from public.dabbir_ai_knowledge_proposals where business_id=p_business_id and entity_type=k.entity_type and lower(alias)=lower(k.alias);
  st:=case when p_action in ('approve','rollback') then 'OWNER_APPROVED' when p_action='reject' then 'REJECTED' else 'REVOKED' end;
  if st='OWNER_APPROVED' then
    update public.dabbir_ai_knowledge_proposals set status='SUPERSEDED' where business_id=p_business_id and entity_type=k.entity_type and lower(alias)=lower(k.alias) and status='OWNER_APPROVED';
  end if;
  update public.dabbir_ai_knowledge_proposals set status=st,version=v,reviewed_by=u,reviewed_at=now(),confidence=case when st='OWNER_APPROVED' then 1 else confidence end where business_id=p_business_id and id=k.id;
  key:='semantic_alias:'||k.entity_type||':'||lower(k.alias);
  if st='OWNER_APPROVED' then
    insert into public.dabbir_business_knowledge(business_id,knowledge_key,knowledge_type,value,source,confidence,status)
      values(p_business_id,key,'policy',jsonb_build_object('proposal_id',k.id,'entity_type',k.entity_type,'alias',k.alias,'target_id',k.target_id,'version',v),'owner_approved',1,'approved')
      on conflict(business_id,knowledge_key) do update set value=excluded.value,source=excluded.source,confidence=1,status='approved',updated_at=now();
  elsif st='REVOKED' then
    update public.dabbir_business_knowledge set status='superseded',updated_at=now() where business_id=p_business_id and knowledge_key=key and value->>'proposal_id'=k.id::text;
  end if;
  insert into public.dabbir_ai_understanding_events(business_id,conversation_id,proposal_id,event_type,version,actor_id)
    values(p_business_id,k.source_conversation_id,k.id,case when p_action='rollback' then 'ROLLBACK' else st end,v,u);
  return jsonb_build_object('id',k.id,'status',st,'version',v,'active',st='OWNER_APPROVED');
end $$;
