create or replace function public.dabbir_platform_owner_support_summary_v1(p_customer_no text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_no text:=upper(trim(coalesce(p_customer_no,'')));
  v_target uuid;
  v_cases jsonb;
  v_open int:=0;
  v_waiting int:=0;
  v_resolved int:=0;
begin
  if v_no !~ '^DAB-[0-9]{6,}$' then raise exception 'INVALID_CUSTOMER_NUMBER'; end if;
  select a.user_id into v_target from public.dabbir_user_accounts a where a.customer_no=v_no;
  if v_target is null then raise exception 'CUSTOMER_ACCOUNT_NOT_FOUND'; end if;
  select
    count(*) filter(where c.status='open')::int,
    count(*) filter(where c.status='waiting')::int,
    count(*) filter(where c.status='resolved')::int,
    coalesce(jsonb_agg(jsonb_build_object(
      'id',c.id,'business_id',c.business_id,'category',c.category,'priority',c.priority,'status',c.status,'subject',c.subject,
      'created_at',c.created_at,'updated_at',c.updated_at,'resolved_at',c.resolved_at,
      'notes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'note',n.note,'created_at',n.created_at) order by n.created_at) from dabbir_private.platform_customer_support_notes n where n.case_id=c.id),'[]'::jsonb)
    ) order by c.created_at desc),'[]'::jsonb)
  into v_open,v_waiting,v_resolved,v_cases
  from dabbir_private.platform_customer_support_cases c
  where c.target_user_id=v_target or (c.target_user_id is null and c.customer_no=v_no);
  return jsonb_build_object('customer_no',v_no,'metrics',jsonb_build_object('open',coalesce(v_open,0),'waiting',coalesce(v_waiting,0),'resolved',coalesce(v_resolved,0),'total',coalesce(v_open,0)+coalesce(v_waiting,0)+coalesce(v_resolved,0)),'cases',coalesce(v_cases,'[]'::jsonb));
end;
$$;
revoke all on function public.dabbir_platform_owner_support_summary_v1(text) from public,anon,authenticated;
grant execute on function public.dabbir_platform_owner_support_summary_v1(text) to service_role;
