create table if not exists public.dabbir_platform_owner_incidents (
  id uuid primary key default gen_random_uuid(), customer_no text not null,
  business_id uuid references public.dabbir_businesses(id) on delete set null,
  category text not null check (category in ('ACCESS','BILLING','WHATSAPP','INVENTORY','ORDERS','TEAM','DATA','TECHNICAL','INTEGRATION','GENERAL')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','diagnosing','action_required','waiting_customer','escalated','resolved','closed')),
  assigned_queue text not null default 'owner' check (assigned_queue in ('owner','support','engineering','billing','identity','external_provider')),
  summary text not null check (char_length(summary) between 3 and 200), description text, root_cause text, resolution text,
  sla_due_at timestamptz, created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(), resolved_at timestamptz, last_event_at timestamptz not null default clock_timestamp()
);
create index if not exists dabbir_platform_owner_incidents_customer_idx on public.dabbir_platform_owner_incidents(customer_no,updated_at desc);
create index if not exists dabbir_platform_owner_incidents_business_idx on public.dabbir_platform_owner_incidents(business_id,updated_at desc);
create index if not exists dabbir_platform_owner_incidents_status_idx on public.dabbir_platform_owner_incidents(status,priority,updated_at desc);

create table if not exists public.dabbir_platform_owner_incident_events (
  id uuid primary key default gen_random_uuid(), incident_id uuid not null references public.dabbir_platform_owner_incidents(id) on delete cascade,
  event_type text not null check (event_type in ('created','note','diagnostic','status','action','escalation','resolution','customer_update','system')),
  message text not null check (char_length(message) between 1 and 4000), metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default clock_timestamp()
);
create index if not exists dabbir_platform_owner_incident_events_incident_idx on public.dabbir_platform_owner_incident_events(incident_id,created_at desc);
alter table public.dabbir_platform_owner_incidents enable row level security; alter table public.dabbir_platform_owner_incidents force row level security;
alter table public.dabbir_platform_owner_incident_events enable row level security; alter table public.dabbir_platform_owner_incident_events force row level security;
revoke all on public.dabbir_platform_owner_incidents from anon,authenticated; revoke all on public.dabbir_platform_owner_incident_events from anon,authenticated;
grant select,insert,update on public.dabbir_platform_owner_incidents to service_role; grant select,insert on public.dabbir_platform_owner_incident_events to service_role;

create or replace function public.dabbir_platform_owner_incident_create_v1(p_customer_no text,p_business_id uuid,p_category text,p_priority text,p_summary text,p_description text default null,p_assigned_queue text default 'owner') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_due timestamptz;v_cat text:=upper(trim(coalesce(p_category,'GENERAL')));v_pri text:=lower(trim(coalesce(p_priority,'normal')));v_queue text:=lower(trim(coalesce(p_assigned_queue,'owner')));v_no text:=upper(trim(coalesce(p_customer_no,'')));
begin
 if v_no !~ '^DAB-[0-9]{6,}$' then raise exception 'INVALID_CUSTOMER_NUMBER'; end if;
 if not exists(select 1 from public.dabbir_user_accounts where customer_no=v_no) then raise exception 'CUSTOMER_NOT_FOUND'; end if;
 if p_business_id is not null and not exists(select 1 from public.dabbir_businesses where id=p_business_id) then raise exception 'BUSINESS_NOT_FOUND'; end if;
 if v_cat not in ('ACCESS','BILLING','WHATSAPP','INVENTORY','ORDERS','TEAM','DATA','TECHNICAL','INTEGRATION','GENERAL') then raise exception 'INVALID_INCIDENT_CATEGORY'; end if;
 if v_pri not in ('low','normal','high','urgent') then raise exception 'INVALID_INCIDENT_PRIORITY'; end if;
 if v_queue not in ('owner','support','engineering','billing','identity','external_provider') then raise exception 'INVALID_INCIDENT_QUEUE'; end if;
 if char_length(trim(coalesce(p_summary,''))) not between 3 and 200 then raise exception 'INCIDENT_SUMMARY_REQUIRED'; end if;
 v_due:=clock_timestamp()+case v_pri when 'urgent' then interval '15 minutes' when 'high' then interval '1 hour' when 'normal' then interval '4 hours' else interval '1 day' end;
 insert into public.dabbir_platform_owner_incidents(customer_no,business_id,category,priority,status,assigned_queue,summary,description,sla_due_at) values(v_no,p_business_id,v_cat,v_pri,'open',v_queue,trim(p_summary),nullif(trim(coalesce(p_description,'')),''),v_due) returning id into v_id;
 insert into public.dabbir_platform_owner_incident_events(incident_id,event_type,message,metadata) values(v_id,'created','تم فتح الحالة',jsonb_build_object('priority',v_pri,'category',v_cat,'queue',v_queue,'sla_due_at',v_due));
 if p_business_id is not null then insert into public.dabbir_platform_owner_audit(business_id,action,entity_type,entity_id,reason,outcome,before_state,after_state) values(p_business_id,'incident_create','incident',v_id,'إنشاء حالة دعم/تشغيل','VERIFIED_SUCCESS',null,jsonb_build_object('customer_no',v_no,'category',v_cat,'priority',v_pri,'status','open')); end if;
 return jsonb_build_object('ok',true,'incident_id',v_id,'sla_due_at',v_due);
end $$;

create or replace function public.dabbir_platform_owner_incident_update_v1(p_incident_id uuid,p_status text default null,p_priority text default null,p_assigned_queue text default null,p_root_cause text default null,p_resolution text default null,p_note text default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_before jsonb;v_after jsonb;v_st text;v_pri text;v_queue text;v_business uuid;
begin
 select to_jsonb(i),i.business_id into v_before,v_business from public.dabbir_platform_owner_incidents i where i.id=p_incident_id for update; if v_before is null then raise exception 'INCIDENT_NOT_FOUND'; end if;
 v_st:=coalesce(lower(nullif(trim(p_status),'')),v_before->>'status');v_pri:=coalesce(lower(nullif(trim(p_priority),'')),v_before->>'priority');v_queue:=coalesce(lower(nullif(trim(p_assigned_queue),'')),v_before->>'assigned_queue');
 if v_st not in ('open','diagnosing','action_required','waiting_customer','escalated','resolved','closed') then raise exception 'INVALID_INCIDENT_STATUS'; end if;
 if v_pri not in ('low','normal','high','urgent') then raise exception 'INVALID_INCIDENT_PRIORITY'; end if;
 if v_queue not in ('owner','support','engineering','billing','identity','external_provider') then raise exception 'INVALID_INCIDENT_QUEUE'; end if;
 update public.dabbir_platform_owner_incidents set status=v_st,priority=v_pri,assigned_queue=v_queue,root_cause=coalesce(nullif(trim(coalesce(p_root_cause,'')),''),root_cause),resolution=coalesce(nullif(trim(coalesce(p_resolution,'')),''),resolution),resolved_at=case when v_st in ('resolved','closed') then coalesce(resolved_at,clock_timestamp()) else null end,updated_at=clock_timestamp(),last_event_at=clock_timestamp() where id=p_incident_id;
 if nullif(trim(coalesce(p_note,'')),'') is not null then insert into public.dabbir_platform_owner_incident_events(incident_id,event_type,message,metadata) values(p_incident_id,'note',trim(p_note),jsonb_build_object('status',v_st,'queue',v_queue)); end if;
 if v_st<>(v_before->>'status') then insert into public.dabbir_platform_owner_incident_events(incident_id,event_type,message,metadata) values(p_incident_id,case when v_st='escalated' then 'escalation' when v_st in ('resolved','closed') then 'resolution' else 'status' end,'تغيير حالة المشكلة',jsonb_build_object('from',v_before->>'status','to',v_st,'queue',v_queue)); end if;
 select to_jsonb(i) into v_after from public.dabbir_platform_owner_incidents i where i.id=p_incident_id;
 if v_business is not null then insert into public.dabbir_platform_owner_audit(business_id,action,entity_type,entity_id,reason,outcome,before_state,after_state) values(v_business,'incident_update','incident',p_incident_id,'تحديث حالة دعم/تشغيل','VERIFIED_SUCCESS',v_before,v_after); end if;
 return jsonb_build_object('ok',true,'incident',v_after);
end $$;
revoke all on function public.dabbir_platform_owner_incident_create_v1(text,uuid,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.dabbir_platform_owner_incident_update_v1(uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_platform_owner_incident_create_v1(text,uuid,text,text,text,text,text) to service_role;
grant execute on function public.dabbir_platform_owner_incident_update_v1(uuid,text,text,text,text,text,text) to service_role;
