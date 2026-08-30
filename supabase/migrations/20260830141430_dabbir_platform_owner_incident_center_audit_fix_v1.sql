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
 if p_business_id is not null then insert into public.dabbir_platform_owner_audit(business_id,action,entity_type,entity_id,reason,outcome,before_state,after_state) values(p_business_id,'incident_create','incident',v_id,'إنشاء حالة دعم/تشغيل','VERIFIED_SUCCESS','{}'::jsonb,jsonb_build_object('customer_no',v_no,'category',v_cat,'priority',v_pri,'status','open')); end if;
 return jsonb_build_object('ok',true,'incident_id',v_id,'sla_due_at',v_due);
end $$;
revoke all on function public.dabbir_platform_owner_incident_create_v1(text,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_platform_owner_incident_create_v1(text,uuid,text,text,text,text,text) to service_role;
