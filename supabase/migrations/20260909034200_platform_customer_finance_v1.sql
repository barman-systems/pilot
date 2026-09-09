-- DABBIR platform-customer financial oversight.
-- Scope: DABBIR's subscription evidence and AI operating cost only.
-- It intentionally excludes tenant/customer operational payments and never fabricates revenue or margin.

create or replace function public.dabbir_platform_customer_business_access_v1(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_business_id uuid
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','public','dabbir_private'
as $function$
begin
  perform dabbir_private.platform_assert_permission(p_actor_user_id,'manage_customers');
  if not dabbir_private.platform_scope_allows_business(p_actor_user_id,p_business_id) then
    raise exception 'DABBIR_BUSINESS_SCOPE_REQUIRED';
  end if;
  if not exists(
    select 1
    from public.dabbir_memberships m
    where m.user_id=p_target_user_id
      and m.business_id=p_business_id
      and m.status='active'
  ) then
    raise exception 'DABBIR_CUSTOMER_BUSINESS_MISMATCH';
  end if;
  return true;
end;
$function$;

create or replace function public.dabbir_platform_customer_finance_overview_v1(p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','dabbir_private'
as $function$
declare
  v_month_start timestamptz:=pg_catalog.date_trunc('month',pg_catalog.now());
  v_month_end timestamptz:=pg_catalog.date_trunc('month',pg_catalog.now())+interval '1 month';
  v_web_environment text;
  v_result jsonb;
begin
  perform dabbir_private.platform_assert_permission(p_actor_user_id,'manage_customers');
  if coalesce(dabbir_private.platform_effective_capability(p_actor_user_id,'payments.view'),false) is not true then
    raise exception 'DABBIR_FINANCIAL_ACCESS_REQUIRED';
  end if;

  v_web_environment:=case
    when exists(select 1 from public.dabbir_stripe_events where livemode=true) then 'LIVE_EVIDENCE_PRESENT'
    when exists(select 1 from public.dabbir_stripe_events where livemode=false) then 'SANDBOX_ONLY'
    else 'NO_PROVIDER_EVENTS'
  end;

  with scoped_businesses as (
    select b.id
    from public.dabbir_businesses b
    where dabbir_private.platform_scope_allows_business(p_actor_user_id,b.id)
  ),
  ai as (
    select
      count(distinct v.business_id)::bigint as businesses,
      coalesce(sum(v.ai_requests),0)::bigint as ai_requests,
      coalesce(sum(v.input_tokens),0)::bigint as input_tokens,
      coalesce(sum(v.output_tokens),0)::bigint as output_tokens,
      coalesce(sum(v.reasoning_tokens),0)::bigint as reasoning_tokens,
      round(coalesce(sum(v.known_cost_aed),0),6) as known_cost_aed,
      round(coalesce(sum(v.known_cost_usd),0),6) as known_cost_usd,
      coalesce(sum(v.unpriced_operations),0)::bigint as unpriced_operations
    from public.dabbir_ai_customer_cost_monthly_v1 v
    join scoped_businesses sb on sb.id=v.business_id
    where v.month_start>=v_month_start and v.month_start<v_month_end
  )
  select jsonb_build_object(
    'generated_at',pg_catalog.now(),
    'month_start',v_month_start,
    'scope','DABBIR_PLATFORM_FINANCE_ONLY',
    'ai',jsonb_build_object(
      'businesses',ai.businesses,
      'ai_requests',ai.ai_requests,
      'input_tokens',ai.input_tokens,
      'output_tokens',ai.output_tokens,
      'reasoning_tokens',ai.reasoning_tokens,
      'total_tokens',ai.input_tokens+ai.output_tokens+ai.reasoning_tokens,
      'known_cost_aed',ai.known_cost_aed,
      'known_cost_usd',ai.known_cost_usd,
      'unpriced_operations',ai.unpriced_operations,
      'measurement_state',case when ai.unpriced_operations>0 then 'PARTIAL' when ai.ai_requests=0 then 'NO_METERED_AI' else 'COMPLETE' end
    ),
    'subscriptions',jsonb_build_object(
      'web_billing_environment',v_web_environment,
      'web_records',(
        select count(*) from public.dabbir_billing_accounts ba
        where exists(select 1 from scoped_businesses sb where sb.id=ba.business_id)
      ),
      'web_active_records',(
        select count(*) from public.dabbir_billing_accounts ba
        where exists(select 1 from scoped_businesses sb where sb.id=ba.business_id)
          and lower(coalesce(ba.status,'')) in ('active','trialing')
      ),
      'apple_production_active',(
        select count(*) from public.dabbir_apple_entitlements e
        where lower(coalesce(e.environment,''))='production'
          and lower(coalesce(e.status,''))='active'
          and coalesce(e.expires_at,pg_catalog.now()+interval '1 second')>pg_catalog.now()
          and exists(
            select 1 from public.dabbir_memberships m
            join scoped_businesses sb on sb.id=m.business_id
            where m.user_id=e.user_id and m.status='active'
          )
      ),
      'google_production_active',(
        select count(*) from public.dabbir_google_entitlements e
        where lower(coalesce(e.environment,''))='production'
          and lower(coalesce(e.status,''))='active'
          and coalesce(e.expires_at,pg_catalog.now()+interval '1 second')>pg_catalog.now()
          and exists(
            select 1 from public.dabbir_memberships m
            join scoped_businesses sb on sb.id=m.business_id
            where m.user_id=e.user_id and m.status='active'
          )
      )
    ),
    'revenue_state','UNAVAILABLE_NO_AUTHORITATIVE_PRICE_LEDGER',
    'margin_state','UNAVAILABLE_NO_AUTHORITATIVE_REVENUE'
  ) into v_result
  from ai;

  insert into dabbir_private.platform_customer_admin_audit(actor_user_id,action,details)
  values(p_actor_user_id,'customer_finance_overview',jsonb_build_object('month_start',v_month_start));
  return v_result;
end;
$function$;

create or replace function public.dabbir_platform_customer_finance_v1(p_actor_user_id uuid,p_target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','dabbir_private','auth'
as $function$
declare
  v_month_start timestamptz:=pg_catalog.date_trunc('month',pg_catalog.now());
  v_month_end timestamptz:=pg_catalog.date_trunc('month',pg_catalog.now())+interval '1 month';
  v_web_environment text;
  v_result jsonb;
begin
  perform dabbir_private.platform_assert_permission(p_actor_user_id,'manage_customers');
  if coalesce(dabbir_private.platform_effective_capability(p_actor_user_id,'payments.view'),false) is not true then
    raise exception 'DABBIR_FINANCIAL_ACCESS_REQUIRED';
  end if;
  if not exists(select 1 from public.dabbir_user_accounts where user_id=p_target_user_id) then
    raise exception 'DABBIR_CUSTOMER_ACCOUNT_NOT_FOUND';
  end if;
  if not exists(
    select 1
    from public.dabbir_memberships m
    where m.user_id=p_target_user_id
      and m.status='active'
      and dabbir_private.platform_scope_allows_business(p_actor_user_id,m.business_id)
  ) then
    raise exception 'DABBIR_CUSTOMER_OUTSIDE_SCOPE';
  end if;

  v_web_environment:=case
    when exists(select 1 from public.dabbir_stripe_events where livemode=true) then 'LIVE_EVIDENCE_PRESENT'
    when exists(select 1 from public.dabbir_stripe_events where livemode=false) then 'SANDBOX_ONLY'
    else 'NO_PROVIDER_EVENTS'
  end;

  with member_businesses as (
    select b.id,b.name,b.business_type,b.demo_mode,b.currency_code,m.role,m.status as membership_status
    from public.dabbir_memberships m
    join public.dabbir_businesses b on b.id=m.business_id
    where m.user_id=p_target_user_id
      and m.status='active'
      and dabbir_private.platform_scope_allows_business(p_actor_user_id,b.id)
  ),
  ai as (
    select
      v.business_id,
      coalesce(sum(v.ai_requests),0)::bigint as ai_requests,
      coalesce(sum(v.input_tokens),0)::bigint as input_tokens,
      coalesce(sum(v.output_tokens),0)::bigint as output_tokens,
      coalesce(sum(v.reasoning_tokens),0)::bigint as reasoning_tokens,
      round(coalesce(sum(v.known_cost_aed),0),6) as known_cost_aed,
      round(coalesce(sum(v.known_cost_usd),0),6) as known_cost_usd,
      coalesce(sum(v.unpriced_operations),0)::bigint as unpriced_operations,
      round(coalesce(sum(v.known_cost_aed) filter(where v.channel='whatsapp'),0),6) as whatsapp_known_cost_aed,
      coalesce(sum(v.unpriced_operations) filter(where v.channel='whatsapp'),0)::bigint as whatsapp_unpriced_operations
    from public.dabbir_ai_customer_cost_monthly_v1 v
    join member_businesses mb on mb.id=v.business_id
    where v.month_start>=v_month_start and v.month_start<v_month_end
    group by v.business_id
  ),
  usage as (
    select
      m.business_id,
      count(*)::bigint as messages,
      count(distinct m.conversation_id)::bigint as conversations,
      count(*) filter(where coalesce(m.simulated,false)=true)::bigint as simulated_messages,
      count(*) filter(where c.channel_type='whatsapp')::bigint as whatsapp_messages,
      count(distinct m.conversation_id) filter(where c.channel_type='whatsapp')::bigint as whatsapp_conversations
    from public.dabbir_messages m
    join member_businesses mb on mb.id=m.business_id
    left join public.dabbir_conversations c on c.id=m.conversation_id
    where m.created_at>=v_month_start and m.created_at<v_month_end
    group by m.business_id
  ),
  provider_rollup as (
    select business_id,jsonb_agg(jsonb_build_object(
      'provider',provider,
      'ai_requests',ai_requests,
      'known_cost_aed',known_cost_aed,
      'unpriced_operations',unpriced_operations
    ) order by known_cost_aed desc,ai_requests desc) as providers
    from (
      select v.business_id,v.provider,
        coalesce(sum(v.ai_requests),0)::bigint as ai_requests,
        round(coalesce(sum(v.known_cost_aed),0),6) as known_cost_aed,
        coalesce(sum(v.unpriced_operations),0)::bigint as unpriced_operations
      from public.dabbir_ai_customer_cost_monthly_v1 v
      join member_businesses mb on mb.id=v.business_id
      where v.month_start>=v_month_start and v.month_start<v_month_end
      group by v.business_id,v.provider
    ) x
    group by business_id
  ),
  business_rows as (
    select mb.id, jsonb_build_object(
      'id',mb.id,
      'name',mb.name,
      'business_type',mb.business_type,
      'demo_mode',mb.demo_mode,
      'currency_code',mb.currency_code,
      'role',mb.role,
      'membership_status',mb.membership_status,
      'billing',case when ba.business_id is null then null else jsonb_build_object(
        'status',ba.status,
        'trial_started_at',ba.trial_started_at,
        'trial_ends_at',ba.trial_ends_at,
        'current_period_ends_at',ba.current_period_ends_at,
        'cancel_at_period_end',ba.cancel_at_period_end,
        'canceled_at',ba.canceled_at,
        'last_invoice_status',ba.last_invoice_status,
        'updated_at',ba.updated_at
      ) end,
      'ai',jsonb_build_object(
        'ai_requests',coalesce(ai.ai_requests,0),
        'input_tokens',coalesce(ai.input_tokens,0),
        'output_tokens',coalesce(ai.output_tokens,0),
        'reasoning_tokens',coalesce(ai.reasoning_tokens,0),
        'total_tokens',coalesce(ai.input_tokens,0)+coalesce(ai.output_tokens,0)+coalesce(ai.reasoning_tokens,0),
        'known_cost_aed',coalesce(ai.known_cost_aed,0),
        'known_cost_usd',coalesce(ai.known_cost_usd,0),
        'unpriced_operations',coalesce(ai.unpriced_operations,0),
        'whatsapp_known_cost_aed',coalesce(ai.whatsapp_known_cost_aed,0),
        'whatsapp_unpriced_operations',coalesce(ai.whatsapp_unpriced_operations,0),
        'measurement_state',case when coalesce(ai.unpriced_operations,0)>0 then 'PARTIAL' when coalesce(ai.ai_requests,0)=0 then 'NO_METERED_AI' else 'COMPLETE' end
      ),
      'usage',jsonb_build_object(
        'messages',coalesce(u.messages,0),
        'conversations',coalesce(u.conversations,0),
        'simulated_messages',coalesce(u.simulated_messages,0),
        'whatsapp_messages',coalesce(u.whatsapp_messages,0),
        'whatsapp_conversations',coalesce(u.whatsapp_conversations,0),
        'known_whatsapp_cost_per_conversation_aed',case when coalesce(u.whatsapp_conversations,0)>0 then round(coalesce(ai.whatsapp_known_cost_aed,0)/u.whatsapp_conversations,6) else null end
      ),
      'providers',coalesce(pr.providers,'[]'::jsonb),
      'revenue_state','UNAVAILABLE_NO_AUTHORITATIVE_PRICE_LEDGER',
      'margin_state','UNAVAILABLE_NO_AUTHORITATIVE_REVENUE'
    ) as value
    from member_businesses mb
    left join public.dabbir_billing_accounts ba on ba.business_id=mb.id
    left join ai on ai.business_id=mb.id
    left join usage u on u.business_id=mb.id
    left join provider_rollup pr on pr.business_id=mb.id
  )
  select jsonb_build_object(
    'generated_at',pg_catalog.now(),
    'month_start',v_month_start,
    'scope','DABBIR_PLATFORM_FINANCE_ONLY',
    'web_billing_environment',v_web_environment,
    'subscriptions',jsonb_build_object(
      'apple',coalesce((select jsonb_agg(jsonb_build_object(
        'product_id',e.product_id,'environment',e.environment,'status',e.status,'expires_at',e.expires_at,'revoked_at',e.revoked_at,'verified_at',e.verified_at
      ) order by e.updated_at desc) from public.dabbir_apple_entitlements e where e.user_id=p_target_user_id),'[]'::jsonb),
      'google',coalesce((select jsonb_agg(jsonb_build_object(
        'product_id',e.product_id,'environment',e.environment,'status',e.status,'subscription_state',e.subscription_state,'auto_renew_enabled',e.auto_renew_enabled,'expires_at',e.expires_at,'verified_at',e.verified_at
      ) order by e.updated_at desc) from public.dabbir_google_entitlements e where e.user_id=p_target_user_id),'[]'::jsonb)
    ),
    'businesses',coalesce((select jsonb_agg(value order by id) from business_rows),'[]'::jsonb),
    'revenue_state','UNAVAILABLE_NO_AUTHORITATIVE_PRICE_LEDGER',
    'margin_state','UNAVAILABLE_NO_AUTHORITATIVE_REVENUE'
  ) into v_result;

  insert into dabbir_private.platform_customer_admin_audit(actor_user_id,action,target_user_id,details)
  values(p_actor_user_id,'customer_finance',p_target_user_id,jsonb_build_object('month_start',v_month_start));
  return v_result;
end;
$function$;

revoke all on function public.dabbir_platform_customer_business_access_v1(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.dabbir_platform_customer_business_access_v1(uuid,uuid,uuid) to service_role;
revoke all on function public.dabbir_platform_customer_finance_overview_v1(uuid) from public,anon,authenticated;
grant execute on function public.dabbir_platform_customer_finance_overview_v1(uuid) to service_role;
revoke all on function public.dabbir_platform_customer_finance_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.dabbir_platform_customer_finance_v1(uuid,uuid) to service_role;
