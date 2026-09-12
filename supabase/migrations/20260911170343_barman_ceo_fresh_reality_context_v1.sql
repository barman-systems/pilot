-- BARMAN Executive OS closed-loop preparation: fresh reality + reusable executive context.
create or replace function public.barman_executive_record_reality_v1(p_reality jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','dabbir_private','pg_temp'
as $function$
declare
  v_observed_at timestamptz;
  v_confidence numeric:=0;
  v_fresh boolean:=false;
  v_sufficient boolean:=false;
  v_status text;
  v_reason text;
begin
  if jsonb_typeof(coalesce(p_reality,'{}'::jsonb))<>'object' then raise exception 'REALITY_OBJECT_REQUIRED'; end if;
  begin v_observed_at:=nullif(p_reality->>'observed_at','')::timestamptz; exception when others then v_observed_at:=null; end;
  begin v_confidence:=greatest(0,least(1,coalesce((p_reality->>'confidence')::numeric,0))); exception when others then v_confidence:=0; end;
  v_fresh:=v_observed_at is not null and v_observed_at>=now()-interval '10 minutes' and v_observed_at<=now()+interval '1 minute' and upper(coalesce(p_reality->>'freshness',''))='FRESH';
  v_sufficient:=v_fresh and v_confidence>=0.70 and coalesce(p_reality->>'source','')<>'' and coalesce(p_reality->>'subject','')<>'' and jsonb_typeof(coalesce(p_reality->'evidence_refs','[]'::jsonb))='array';
  v_status:=case when v_sufficient then 'HEALTHY' else 'DEGRADED' end;
  v_reason:=case when not v_fresh then 'STALE_REALITY' when v_confidence<0.70 then 'INSUFFICIENT_FRESH_EVIDENCE' else 'FRESH_REALITY' end;
  insert into dabbir_private.executive_health_checks(component,status,details,evidence)
  values('BARMAN Executive Reality',v_status,p_reality||jsonb_build_object('fresh',v_fresh,'sufficient',v_sufficient,'reason',v_reason),coalesce(p_reality->'evidence_refs','[]'::jsonb));
  update dabbir_private.executive_integrations
  set last_checked_at=now(),last_success_at=case when v_sufficient then now() else last_success_at end,last_failure_at=case when v_sufficient then last_failure_at else now() end,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('executive_reality_observed_at',v_observed_at,'executive_reality_fresh',v_fresh,'executive_reality_confidence',v_confidence)
  where integration_key in ('github_pilot','vercel_dabbir','supabase_mumbai');
  if v_sufficient then
    update dabbir_private.executive_incidents set status='RESOLVED',resolution='Fresh external executive reality restored and persisted.',resolved_at=now(),evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object('reality',p_reality)
    where incident_key='BARMAN-EXECUTIVE-REALITY-STALE' and status not in ('RESOLVED','CLOSED');
  else
    insert into dabbir_private.executive_incidents(id,incident_key,project_key,severity,status,title,root_cause,containment,evidence,detected_at)
    values(gen_random_uuid(),'BARMAN-EXECUTIVE-REALITY-STALE','DABBIR','HIGH','OPEN','Executive reality is stale or insufficient for autonomous decisions',v_reason,'Block autonomous executive decisions until a fresh sufficiently confident observation is recorded.',jsonb_build_object('reality',p_reality),now())
    on conflict (incident_key) do update set severity='HIGH',status='OPEN',root_cause=excluded.root_cause,containment=excluded.containment,evidence=excluded.evidence,resolved_at=null;
  end if;
  return jsonb_build_object('ok',true,'status',v_status,'reason',v_reason,'fresh',v_fresh,'sufficient',v_sufficient,'observed_at',v_observed_at,'confidence',v_confidence);
end;
$function$;

create or replace function public.barman_executive_read_snapshot_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','dabbir_private','pg_temp'
as $function$
declare v jsonb;
begin
  select jsonb_build_object(
    'generated_at',now(),
    'registered_accounts',jsonb_build_object('total',(select count(*) from public.dabbir_user_accounts)),
    'businesses',jsonb_build_object('total',(select count(*) from public.dabbir_businesses),'new_7d',(select count(*) from public.dabbir_businesses where created_at>=now()-interval '7 days')),
    'customers',jsonb_build_object('total',(select count(*) from public.dabbir_customers),'new_24h',(select count(*) from public.dabbir_customers where created_at>=now()-interval '24 hours'),'new_7d',(select count(*) from public.dabbir_customers where created_at>=now()-interval '7 days')),
    'appointments',jsonb_build_object('total',(select count(*) from public.dabbir_appointments),'created_24h',(select count(*) from public.dabbir_appointments where created_at>=now()-interval '24 hours'),'created_7d',(select count(*) from public.dabbir_appointments where created_at>=now()-interval '7 days'),'scheduled_next_24h',(select count(*) from public.dabbir_appointments where starts_at>=now() and starts_at<now()+interval '24 hours')),
    'orders',jsonb_build_object('total',(select count(*) from public.dabbir_orders),'created_24h',(select count(*) from public.dabbir_orders where created_at>=now()-interval '24 hours'),'created_7d',(select count(*) from public.dabbir_orders where created_at>=now()-interval '7 days')),
    'executive',jsonb_build_object('queued',(select count(*) from dabbir_private.dabbir_ceo_commands where status='QUEUED'),'in_progress',(select count(*) from dabbir_private.dabbir_ceo_commands where status='IN_PROGRESS'),'blocked',(select count(*) from dabbir_private.dabbir_ceo_commands where status='BLOCKED'),'weak_verified_evidence',(select count(*) from dabbir_private.executive_evidence where verified=true and coalesce(verification_method,'') in ('','LEGACY_SELF_ASSERTED'))),
    'reality',(select coalesce(jsonb_build_object('checked_at',h.checked_at,'status',h.status,'details',h.details),'{}'::jsonb) from dabbir_private.executive_health_checks h where h.component='BARMAN Executive Reality' order by h.checked_at desc limit 1),
    'goals',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'project_key',g.project_key,'title',g.title,'objective',g.objective,'status',g.status,'priority',g.priority,'success_metrics',g.success_metrics,'updated_at',g.updated_at) order by g.priority,g.updated_at desc),'[]'::jsonb) from dabbir_private.executive_goals g where g.status='active'),
    'memory',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'scope',m.scope,'memory_key',m.memory_key,'value',m.value,'confidence',m.confidence,'created_at',m.created_at) order by m.created_at desc),'[]'::jsonb) from (select * from dabbir_private.executive_memory where superseded_by is null and (valid_until is null or valid_until>now()) order by created_at desc limit 20) m),
    'health_domains',jsonb_build_object(
      'infrastructure',case when exists(select 1 from dabbir_private.executive_health_checks h where h.component='BARMAN Executive Reality' and h.status='HEALTHY' and h.checked_at>=now()-interval '10 minutes') then 'HEALTHY' else 'DEGRADED' end,
      'runtime',case when exists(select 1 from dabbir_private.executive_health_checks h where h.component='BARMAN Executive Reality' and h.status='HEALTHY' and h.checked_at>=now()-interval '10 minutes') then 'HEALTHY' else 'DEGRADED' end,
      'product','UNKNOWN','customer','UNKNOWN','economic','UNKNOWN',
      'strategic',case when exists(select 1 from dabbir_private.executive_goals where status='active') then 'UNKNOWN' else 'DEGRADED' end
    )
  ) into v;
  return v;
end;
$function$;
revoke all on function public.barman_executive_record_reality_v1(jsonb) from public, anon, authenticated;
revoke all on function public.barman_executive_read_snapshot_v1() from public, anon, authenticated;
grant execute on function public.barman_executive_record_reality_v1(jsonb) to service_role;
grant execute on function public.barman_executive_read_snapshot_v1() to service_role;
