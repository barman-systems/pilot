-- Cohort-based activity funnels. A cohort is a conversation whose first real customer message occurs in the selected window.
-- Missing activity journey telemetry is NOT_MEASURED rather than zero.

create or replace function public.dabbir_owner_funnel_measurement_v1(
  p_scope jsonb,
  p_start timestamptz,
  p_end timestamptz,
  p_business_id uuid default null,
  p_branch_id uuid default null,
  p_channel text default null,
  p_provider text default null,
  p_model text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
set timezone='UTC'
as $$
declare
  v_channel text:=nullif(lower(btrim(coalesce(p_channel,''))),'');
  v_provider text:=nullif(lower(btrim(coalesce(p_provider,''))),'');
  v_model text:=nullif(btrim(coalesce(p_model,'')),'');
  v_state text:='COMPLETE';
  v_attr_missing bigint:=0;
  v_funnels jsonb:='[]'::jsonb;
  v_funnel_start constant timestamptz:='2026-09-07 19:22:29+00';
begin
  if upper(coalesce(p_scope->>'authority_role','')) not in ('ROOT_OWNER','OWNER_DELEGATE') then raise exception 'OWNER_MEASUREMENT_AUTHORITY_REQUIRED'; end if;
  if p_start is null or p_end is null or p_end<=p_start or p_end-p_start>interval '366 days' then raise exception 'OWNER_MEASUREMENT_WINDOW_INVALID'; end if;
  if p_business_id is not null and not exists(select 1 from dabbir_private.owner_scope_businesses_v1(p_scope) s where s.business_id=p_business_id) then raise exception 'OWNER_MEASUREMENT_BUSINESS_SCOPE_DENIED'; end if;

  select count(*) into v_attr_missing
  from public.dabbir_ai_usage_fact_v1 f
  join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=f.business_id
  where f.completed_at>=p_start and f.completed_at<p_end
    and (p_business_id is null or f.business_id=p_business_id)
    and (v_channel is null or lower(f.channel)=v_channel)
    and (v_provider is null or lower(f.provider)=v_provider)
    and (v_model is null or f.model=v_model)
    and ((p_branch_id is not null and f.branch_id is null) or ((v_provider is not null or v_model is not null) and f.conversation_id is null));
  if p_start<v_funnel_start or v_attr_missing>0 then v_state:='PARTIAL'; end if;

  with first_customer as (
    select c.id conversation_id,c.business_id,c.customer_id,c.branch_id,c.channel_type,min(m.created_at) inquiry_at
    from public.dabbir_conversations c
    join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=c.business_id
    join public.dabbir_messages m on m.business_id=c.business_id and m.conversation_id=c.id
    where m.sender_type='customer' and coalesce(m.simulated,false)=false
      and (p_business_id is null or c.business_id=p_business_id)
      and (p_branch_id is null or c.branch_id=p_branch_id)
      and (v_channel is null or lower(c.channel_type)=v_channel)
    group by c.id,c.business_id,c.customer_id,c.branch_id,c.channel_type
    having min(m.created_at)>=p_start and min(m.created_at)<p_end
  ), cohort as (
    select fc.*,b.business_type activity_type
    from first_customer fc join public.dabbir_businesses b on b.id=fc.business_id
    where (v_provider is null and v_model is null) or exists(
      select 1 from public.dabbir_ai_usage_fact_v1 f
      where f.business_id=fc.business_id and f.conversation_id=fc.conversation_id
        and f.completed_at>=fc.inquiry_at and f.completed_at<p_end
        and (v_provider is null or lower(f.provider)=v_provider)
        and (v_model is null or f.model=v_model)
    )
  ), journey as (
    select c.activity_type,c.business_id,c.conversation_id,c.inquiry_at,
      bool_or(f.stage='QUALIFIED' and f.verification_class in ('DATABASE_COMMIT','PROVIDER_CALLBACK','HUMAN_CONFIRMED')) as qualified,
      bool_or(f.stage in ('BOOKED','CONFIRMED') and f.verification_class in ('DATABASE_COMMIT','PROVIDER_CALLBACK','HUMAN_CONFIRMED')) as confirmed,
      bool_or(f.stage='COMPLETED' and f.verification_class in ('DATABASE_COMMIT','PROVIDER_CALLBACK','HUMAN_CONFIRMED')) as completed,
      bool_or(f.stage='PAYMENT_RECORDED' and f.verification_class in ('DATABASE_COMMIT','PROVIDER_CALLBACK','HUMAN_CONFIRMED')) as paid,
      bool_or(f.appointment_id is not null and exists(select 1 from public.dabbir_appointments a where a.id=f.appointment_id and a.business_id=f.business_id and a.worker_id is not null)) as assigned
    from cohort c
    left join public.dabbir_ai_booking_funnel_events f on f.business_id=c.business_id and f.conversation_id=c.conversation_id and f.occurred_at>=c.inquiry_at and f.occurred_at<p_end
    group by c.activity_type,c.business_id,c.conversation_id,c.inquiry_at
  ), counts as (
    select activity_type,count(*)::bigint inquiry_count,
      count(*) filter(where qualified)::bigint qualified_count,
      count(*) filter(where confirmed)::bigint confirmed_count,
      count(*) filter(where assigned)::bigint assigned_count,
      count(*) filter(where completed)::bigint completed_count,
      count(*) filter(where paid)::bigint paid_count
    from journey group by activity_type
  ), all_types as (
    select distinct b.business_type activity_type
    from public.dabbir_businesses b join dabbir_private.owner_scope_businesses_v1(p_scope) s on s.business_id=b.id
    where p_business_id is null or b.id=p_business_id
  ), result as (
    select t.activity_type,coalesce(c.inquiry_count,0)::bigint inquiry_count,
      case when t.activity_type in ('store','creator','real_estate') then 'NOT_MEASURED' else v_state end measurement_state,
      case
        when t.activity_type='car_wash' then jsonb_build_array(
          jsonb_build_object('stage','INQUIRY','count',coalesce(c.inquiry_count,0),'measurement_state','COMPLETE','next_stage','QUALIFIED','dropoff_count',case when c.inquiry_count is null or c.qualified_count is null or c.inquiry_count<c.qualified_count then null else c.inquiry_count-c.qualified_count end,'dropoff_rate',case when coalesce(c.inquiry_count,0)=0 or c.inquiry_count<c.qualified_count then null else round((c.inquiry_count-c.qualified_count)::numeric/c.inquiry_count*100,2) end),
          jsonb_build_object('stage','QUALIFIED','count',coalesce(c.qualified_count,0),'measurement_state',v_state,'next_stage','OFFERED','dropoff_count',null,'dropoff_rate',null),
          jsonb_build_object('stage','OFFERED','count',null,'measurement_state','NOT_MEASURED','next_stage','CONFIRMED','dropoff_count',null,'dropoff_rate',null),
          jsonb_build_object('stage','CONFIRMED','count',coalesce(c.confirmed_count,0),'measurement_state',v_state,'next_stage','ASSIGNED','dropoff_count',case when c.confirmed_count is null or c.assigned_count is null or c.confirmed_count<c.assigned_count then null else c.confirmed_count-c.assigned_count end,'dropoff_rate',case when coalesce(c.confirmed_count,0)=0 or c.confirmed_count<c.assigned_count then null else round((c.confirmed_count-c.assigned_count)::numeric/c.confirmed_count*100,2) end),
          jsonb_build_object('stage','ASSIGNED','count',coalesce(c.assigned_count,0),'measurement_state',v_state,'next_stage','REMINDED','dropoff_count',null,'dropoff_rate',null),
          jsonb_build_object('stage','REMINDED','count',null,'measurement_state','NOT_MEASURED','next_stage','COMPLETED','dropoff_count',null,'dropoff_rate',null),
          jsonb_build_object('stage','COMPLETED','count',coalesce(c.completed_count,0),'measurement_state',v_state,'next_stage','PAID','dropoff_count',case when c.completed_count is null or c.paid_count is null or c.completed_count<c.paid_count then null else c.completed_count-c.paid_count end,'dropoff_rate',case when coalesce(c.completed_count,0)=0 or c.completed_count<c.paid_count then null else round((c.completed_count-c.paid_count)::numeric/c.completed_count*100,2) end),
          jsonb_build_object('stage','PAID','count',coalesce(c.paid_count,0),'measurement_state',v_state,'next_stage',null,'dropoff_count',null,'dropoff_rate',null)
        )
        when t.activity_type in ('salon','clinic','services','laundry','other') then jsonb_build_array(
          jsonb_build_object('stage','INQUIRY','count',coalesce(c.inquiry_count,0),'measurement_state','COMPLETE','next_stage','QUALIFIED','dropoff_count',case when c.inquiry_count is null or c.qualified_count is null or c.inquiry_count<c.qualified_count then null else c.inquiry_count-c.qualified_count end,'dropoff_rate',case when coalesce(c.inquiry_count,0)=0 or c.inquiry_count<c.qualified_count then null else round((c.inquiry_count-c.qualified_count)::numeric/c.inquiry_count*100,2) end),
          jsonb_build_object('stage','QUALIFIED','count',coalesce(c.qualified_count,0),'measurement_state',v_state,'next_stage','CONFIRMED','dropoff_count',case when c.qualified_count is null or c.confirmed_count is null or c.qualified_count<c.confirmed_count then null else c.qualified_count-c.confirmed_count end,'dropoff_rate',case when coalesce(c.qualified_count,0)=0 or c.qualified_count<c.confirmed_count then null else round((c.qualified_count-c.confirmed_count)::numeric/c.qualified_count*100,2) end),
          jsonb_build_object('stage','CONFIRMED','count',coalesce(c.confirmed_count,0),'measurement_state',v_state,'next_stage','COMPLETED','dropoff_count',case when c.confirmed_count is null or c.completed_count is null or c.confirmed_count<c.completed_count then null else c.confirmed_count-c.completed_count end,'dropoff_rate',case when coalesce(c.confirmed_count,0)=0 or c.confirmed_count<c.completed_count then null else round((c.confirmed_count-c.completed_count)::numeric/c.confirmed_count*100,2) end),
          jsonb_build_object('stage','COMPLETED','count',coalesce(c.completed_count,0),'measurement_state',v_state,'next_stage','PAID','dropoff_count',case when c.completed_count is null or c.paid_count is null or c.completed_count<c.paid_count then null else c.completed_count-c.paid_count end,'dropoff_rate',case when coalesce(c.completed_count,0)=0 or c.completed_count<c.paid_count then null else round((c.completed_count-c.paid_count)::numeric/c.completed_count*100,2) end),
          jsonb_build_object('stage','PAID','count',coalesce(c.paid_count,0),'measurement_state',v_state,'next_stage',null,'dropoff_count',null,'dropoff_rate',null)
        )
        else jsonb_build_array(
          jsonb_build_object('stage','INQUIRY','count',coalesce(c.inquiry_count,0),'measurement_state','COMPLETE'),
          jsonb_build_object('stage','BUSINESS_OUTCOME','count',null,'measurement_state','NOT_MEASURED','reason','No canonical conversation-linked activity journey exists yet for this activity type.')
        )
      end stages,
      case when coalesce(c.inquiry_count,0)=0 then null when t.activity_type in ('store','creator','real_estate') then null else round(coalesce(c.completed_count,0)::numeric/c.inquiry_count*100,2) end completion_rate,
      case when coalesce(c.inquiry_count,0)=0 then null when t.activity_type in ('store','creator','real_estate') then null else round(coalesce(c.confirmed_count,0)::numeric/c.inquiry_count*100,2) end conversion_rate
    from all_types t left join counts c using(activity_type)
  )
  select coalesce(jsonb_agg(to_jsonb(result) order by activity_type),'[]'::jsonb) into v_funnels from result;

  return jsonb_build_object(
    'window',jsonb_build_object('start',p_start,'end',p_end),
    'cohort_definition','conversation whose first non-simulated customer message occurs in the selected window',
    'measurement_state',v_state,
    'funnels',v_funnels
  );
end;
$$;
revoke all on function public.dabbir_owner_funnel_measurement_v1(jsonb,timestamptz,timestamptz,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_owner_funnel_measurement_v1(jsonb,timestamptz,timestamptz,uuid,uuid,text,text,text) to service_role;
comment on function public.dabbir_owner_funnel_measurement_v1(jsonb,timestamptz,timestamptz,uuid,uuid,text,text,text) is 'Cohort-based owner conversion funnel. Unsupported or uninstrumented activity stages remain NOT_MEASURED; drop-off is withheld when stage ordering cannot be proven.';
