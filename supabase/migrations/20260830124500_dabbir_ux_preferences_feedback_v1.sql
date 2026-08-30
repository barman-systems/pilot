begin;

create table if not exists public.dabbir_user_preferences (
  user_id uuid not null,
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  notification_preferences jsonb not null default '{"handoffs":true,"appointments":true,"channel_issues":true,"daily_summary":true}'::jsonb,
  dashboard_preferences jsonb not null default '{"hidden_metrics":[],"metric_order":["conversations","appointments","customers","attention"]}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, business_id)
);

create table if not exists public.dabbir_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  category text not null check (category in ('general','problem','idea','onboarding')),
  rating smallint check (rating between 1 and 5),
  message text not null check (char_length(message) between 3 and 2000),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dabbir_user_preferences_business_idx
  on public.dabbir_user_preferences (business_id);

create index if not exists dabbir_feedback_business_created_idx
  on public.dabbir_feedback (business_id, created_at desc);

alter table public.dabbir_user_preferences enable row level security;
alter table public.dabbir_feedback enable row level security;

revoke all on public.dabbir_user_preferences from anon;
revoke all on public.dabbir_feedback from anon;
grant select, insert, update on public.dabbir_user_preferences to authenticated;
grant select, insert on public.dabbir_feedback to authenticated;

create policy dabbir_user_preferences_select_self
on public.dabbir_user_preferences
for select to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.dabbir_memberships membership
    where membership.business_id = dabbir_user_preferences.business_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  )
);

create policy dabbir_user_preferences_insert_self
on public.dabbir_user_preferences
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.dabbir_memberships membership
    where membership.business_id = dabbir_user_preferences.business_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  )
);

create policy dabbir_user_preferences_update_self
on public.dabbir_user_preferences
for update to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.dabbir_memberships membership
    where membership.business_id = dabbir_user_preferences.business_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.dabbir_memberships membership
    where membership.business_id = dabbir_user_preferences.business_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  )
);

create policy dabbir_feedback_insert_self
on public.dabbir_feedback
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.dabbir_memberships membership
    where membership.business_id = dabbir_feedback.business_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  )
);

create policy dabbir_feedback_select_self
on public.dabbir_feedback
for select to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.dabbir_memberships membership
    where membership.business_id = dabbir_feedback.business_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  )
);

commit;
