-- Canonical product truth snapshot for the existing DABBIR owner dashboard.
-- This reads DABBIR operational evidence directly. PostHog is delivery/analysis only.

create or replace function public.dabbir_platform_product_truth_snapshot_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with dabbir_users as (
  select u.id,u.created_at
  from auth.users u
  where u.deleted_at is null
    and (
      upper(coalesce(u.raw_user_meta_data->>'product',u.raw_app_meta_data->>'product',''))='DABBIR'
      or exists(select 1 from public.dabbir_memberships m where m.user_id=u.id)
    )
), returning_users as (
  select du.id
  from dabbir_users du
  where (select count(*) from auth.sessions s where s.user_id=du.id)>=2
), businesses as (
  select b.id,b.business_type,b.created_at
  from public.dabbir_businesses b
  where coalesce(b.demo_mode,false)=false
), first_requests as (
  select m.business_id,min(m.created_at) first_request_at
  from public.dabbir_messages m
  join businesses b on b.id=m.business_id
  where m.sender_type='customer' and coalesce(m.simulated,false)=false
  group by m.business_id
), first_actions as (
  select l.business_id,min(l.created_at) first_action_at
  from public.dabbir_ai_action_ledger l
  join businesses b on b.id=l.business_id
  where lower(coalesce(l.result->>'verified','false'))='true'
  group by l.business_id
), activity as (
  select b.business_type,
         count(*)::bigint businesses_created,
         count(fr.business_id)::bigint first_requests,
         count(fa.business_id)::bigint first_actions
  from businesses b
  left join first_requests fr on fr.business_id=b.id
  left join first_actions fa on fa.business_id=b.id
  group by b.business_type
), delivery as (
  select count(*)::bigint total,
         count(*) filter(where posthog_delivered_at is not null)::bigint delivered,
         count(*) filter(where posthog_delivered_at is null and posthog_attempts<5)::bigint pending,
         count(*) filter(where posthog_delivered_at is null and posthog_attempts>=5)::bigint failed,
         max(posthog_delivered_at) last_delivered_at
  from public.dabbir_posthog_product_event_outbox_v1
), token_state as (
  select exists(
    select 1 from vault.decrypted_secrets
    where name='DABBIR_POSTHOG_PROJECT_TOKEN'
      and nullif(btrim(coalesce(decrypted_secret,'')),'') is not null
  ) configured
)
select jsonb_build_object(
  'generated_at',now(),
  'authority','DABBIR_OPERATIONAL_TRUTH',
  'measurement_state','COMPLETE',
  'signup_accounts',(select count(*)::bigint from dabbir_users),
  'returning_users',(select count(*)::bigint from returning_users),
  'businesses_created',(select count(*)::bigint from businesses),
  'first_requests',(select count(*)::bigint from first_requests),
  'first_actions',(select count(*)::bigint from first_actions),
  'activity_breakdown',coalesce((select jsonb_agg(to_jsonb(activity) order by business_type) from activity),'[]'::jsonb),
  'posthog_delivery',jsonb_build_object(
    'state',case
      when not (select configured from token_state) then 'NOT_CONFIGURED'
      when (select failed from delivery)>0 then 'DEGRADED'
      when (select pending from delivery)>0 then 'SYNCING'
      else 'HEALTHY'
    end,
    'total',(select total from delivery),
    'delivered',(select delivered from delivery),
    'pending',(select pending from delivery),
    'failed',(select failed from delivery),
    'last_delivered_at',(select last_delivered_at from delivery)
  )
);
$$;

revoke all on function public.dabbir_platform_product_truth_snapshot_v1() from public,anon,authenticated;
grant execute on function public.dabbir_platform_product_truth_snapshot_v1() to service_role;

comment on function public.dabbir_platform_product_truth_snapshot_v1() is
  'Root-owner product activation truth derived from DABBIR operational evidence; PostHog delivery status is secondary telemetry only.';
