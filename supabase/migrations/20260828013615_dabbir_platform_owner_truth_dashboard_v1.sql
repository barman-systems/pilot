create or replace function public.dabbir_platform_owner_overview(p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','dabbir_private','auth'
as $function$
declare
  v_result jsonb;
begin
  perform dabbir_private.platform_assert_admin(p_actor_user_id);

  with
  customer_counts as (select business_id,count(*)::bigint n from public.dabbir_customers group by business_id),
  conversation_counts as (select business_id,count(*)::bigint n from public.dabbir_conversations group by business_id),
  message_counts as (select business_id,count(*)::bigint n from public.dabbir_messages group by business_id),
  order_counts as (select business_id,count(*)::bigint n from public.dabbir_orders group by business_id),
  appointment_counts as (select business_id,count(*)::bigint n from public.dabbir_appointments group by business_id),
  task_counts as (select business_id,count(*)::bigint n from public.dabbir_tasks group by business_id),
  whatsapp_evidence as (
    select business_id,
      bool_or(lower(coalesce(status,'')) in ('connected','active','ready')
        and nullif(trim(coalesce(waba_id,'')),'') is not null
        and nullif(trim(coalesce(phone_number_id,'')),'') is not null
        and nullif(trim(coalesce(display_phone_number,'')),'') is not null) is_live,
      max(last_verified_at) last_verified_at
    from public.dabbir_whatsapp_connections group by business_id
  ),
  payment_evidence as (
    select business_id,
      bool_or(lower(coalesce(environment,''))='live'
        and lower(coalesce(status,'')) in ('active','connected','enabled','ready')
        and coalesce(charges_enabled,false)
        and nullif(trim(coalesce(external_account_id,'')),'') is not null) is_live,
      max(updated_at) last_verified_at
    from public.dabbir_payment_accounts group by business_id
  ),
  business_base as (
    select b.id,b.name,b.slug,b.business_type,b.demo_mode,b.created_at,
      case
        when coalesce(b.demo_mode,false)
          or lower(coalesce(b.name,'')) like '% demo%'
          or lower(coalesce(b.name,'')) like '%demo %'
          or lower(coalesce(b.slug,'')) like '%demo%' then 'demo'
        when coalesce(b.name,'') ~* '^DABBIR AI QA([[:space:]]|$)'
          or coalesce(b.name,'') ~* 'QA CAPACITY' then 'qa'
        else 'candidate'
      end base_class,
      coalesce(w.is_live,false) whatsapp_live,w.last_verified_at whatsapp_verified_at,
      coalesce(p.is_live,false) payment_live,p.last_verified_at payment_verified_at,
      coalesce(cc.n,0) customers,coalesce(vc.n,0) conversations,coalesce(mc.n,0) messages,
      coalesce(oc.n,0) orders,coalesce(ac.n,0) appointments,coalesce(tc.n,0) tasks
    from public.dabbir_businesses b
    left join whatsapp_evidence w on w.business_id=b.id
    left join payment_evidence p on p.business_id=b.id
    left join customer_counts cc on cc.business_id=b.id
    left join conversation_counts vc on vc.business_id=b.id
    left join message_counts mc on mc.business_id=b.id
    left join order_counts oc on oc.business_id=b.id
    left join appointment_counts ac on ac.business_id=b.id
    left join task_counts tc on tc.business_id=b.id
  ),
  classified as (
    select *,case
      when base_class='demo' then 'demo'
      when base_class='qa' then 'qa'
      when whatsapp_live or payment_live then 'verified_live'
      else 'unverified'
    end truth_class,
    case
      when base_class='demo' then 'demo_flag_or_name'
      when base_class='qa' then 'qa_name_pattern'
      when whatsapp_live or payment_live then 'verified_external_integration'
      else 'no_verified_external_integration'
    end truth_reason
    from business_base
  ),
  account_membership_class as (
    select a.user_id,
      bool_or(c.truth_class='verified_live') has_verified_live,
      bool_or(c.truth_class='unverified') has_unverified,
      bool_or(c.truth_class='qa') has_qa,
      bool_or(c.truth_class='demo') has_demo
    from public.dabbir_user_accounts a
    left join public.dabbir_memberships m on m.user_id=a.user_id and m.status='active'
    left join classified c on c.id=m.business_id
    group by a.user_id
  ),
  account_classified as (
    select user_id,case
      when has_verified_live then 'verified_live'
      when has_unverified then 'unverified'
      when has_qa then 'qa'
      when has_demo then 'demo'
      else 'no_business'
    end truth_class
    from account_membership_class
  )
  select jsonb_build_object(
    'generated_at',now(),
    'policy',jsonb_build_object(
      'version','truth-v1',
      'live_rule','A workspace is VERIFIED_LIVE only when it is not QA/DEMO and has verified live WhatsApp or live payment evidence.',
      'fail_closed',true
    ),
    'summary',jsonb_build_object(
      'businesses_total',(select count(*) from classified),
      'businesses_verified_live',(select count(*) from classified where truth_class='verified_live'),
      'businesses_unverified',(select count(*) from classified where truth_class='unverified'),
      'businesses_qa',(select count(*) from classified where truth_class='qa'),
      'businesses_demo',(select count(*) from classified where truth_class='demo'),
      'verified_live_customers',(select coalesce(sum(customers),0) from classified where truth_class='verified_live'),
      'verified_live_conversations',(select coalesce(sum(conversations),0) from classified where truth_class='verified_live'),
      'verified_live_messages',(select coalesce(sum(messages),0) from classified where truth_class='verified_live'),
      'verified_live_orders',(select coalesce(sum(orders),0) from classified where truth_class='verified_live'),
      'verified_live_appointments',(select coalesce(sum(appointments),0) from classified where truth_class='verified_live'),
      'verified_live_tasks',(select coalesce(sum(tasks),0) from classified where truth_class='verified_live'),
      'raw_customers',(select coalesce(sum(customers),0) from classified),
      'raw_conversations',(select coalesce(sum(conversations),0) from classified),
      'qa_customers_excluded',(select coalesce(sum(customers),0) from classified where truth_class='qa'),
      'qa_conversations_excluded',(select coalesce(sum(conversations),0) from classified where truth_class='qa'),
      'demo_customers_excluded',(select coalesce(sum(customers),0) from classified where truth_class='demo'),
      'demo_conversations_excluded',(select coalesce(sum(conversations),0) from classified where truth_class='demo'),
      'user_accounts_total',(select count(*) from public.dabbir_user_accounts),
      'accounts_verified_live',(select count(*) from account_classified where truth_class='verified_live'),
      'accounts_unverified',(select count(*) from account_classified where truth_class='unverified'),
      'accounts_qa',(select count(*) from account_classified where truth_class='qa'),
      'accounts_demo',(select count(*) from account_classified where truth_class='demo'),
      'accounts_no_business',(select count(*) from account_classified where truth_class='no_business'),
      'active_platform_admins',(select count(*) from public.dabbir_platform_admins where active=true),
      'live_whatsapp_connections',(select count(*) from public.dabbir_whatsapp_connections where lower(coalesce(status,'')) in ('connected','active','ready') and nullif(trim(coalesce(waba_id,'')),'') is not null and nullif(trim(coalesce(phone_number_id,'')),'') is not null),
      'live_payment_accounts',(select count(*) from public.dabbir_payment_accounts where lower(coalesce(environment,''))='live' and lower(coalesce(status,'')) in ('active','connected','enabled','ready') and coalesce(charges_enabled,false))
    ),
    'data_quality',jsonb_build_object(
      'qa_pollution_detected',(select coalesce(sum(customers),0) from classified where truth_class='qa')>0,
      'qa_businesses',(select count(*) from classified where truth_class='qa'),
      'qa_customers',(select coalesce(sum(customers),0) from classified where truth_class='qa'),
      'qa_conversations',(select coalesce(sum(conversations),0) from classified where truth_class='qa')
    ),
    'workspaces',coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'name',name,'slug',slug,'business_type',business_type,'created_at',created_at,
      'truth_class',truth_class,'truth_reason',truth_reason,
      'evidence',jsonb_build_object('whatsapp_live',whatsapp_live,'whatsapp_verified_at',whatsapp_verified_at,'payment_live',payment_live,'payment_verified_at',payment_verified_at),
      'counts',jsonb_build_object('customers',customers,'conversations',conversations,'messages',messages,'orders',orders,'appointments',appointments,'tasks',tasks)
    ) order by case truth_class when 'verified_live' then 1 when 'unverified' then 2 when 'qa' then 3 else 4 end,created_at desc) from classified),'[]'::jsonb)
  ) into v_result;

  insert into dabbir_private.platform_customer_admin_audit(actor_user_id,action,details)
  values(p_actor_user_id,'owner_truth_overview',jsonb_build_object('policy_version','truth-v1'));
  return v_result;
end;
$function$;

revoke all on function public.dabbir_platform_owner_overview(uuid) from public, anon, authenticated;
grant execute on function public.dabbir_platform_owner_overview(uuid) to service_role;
