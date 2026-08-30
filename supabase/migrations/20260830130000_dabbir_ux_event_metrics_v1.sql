begin;

create table if not exists public.dabbir_ux_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  event_name text not null check (event_name in (
    'workspace_first_value',
    'search_opened',
    'search_result_opened',
    'preferences_saved',
    'feedback_submitted',
    'tour_started',
    'tour_completed',
    'conversation_created',
    'appointment_created',
    'load_error_shown'
  )),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 86400000),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dabbir_ux_events_business_created_idx
  on public.dabbir_ux_events (business_id, created_at desc);
create index if not exists dabbir_ux_events_business_event_idx
  on public.dabbir_ux_events (business_id, event_name, created_at desc);

alter table public.dabbir_ux_events enable row level security;
revoke all on public.dabbir_ux_events from anon;
grant insert on public.dabbir_ux_events to authenticated;

create policy dabbir_ux_events_insert_self
on public.dabbir_ux_events
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.dabbir_memberships membership
    where membership.business_id = dabbir_ux_events.business_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  )
);

commit;
