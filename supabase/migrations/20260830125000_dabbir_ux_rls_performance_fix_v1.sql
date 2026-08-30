begin;

drop policy if exists dabbir_user_preferences_select_self on public.dabbir_user_preferences;
drop policy if exists dabbir_user_preferences_insert_self on public.dabbir_user_preferences;
drop policy if exists dabbir_user_preferences_update_self on public.dabbir_user_preferences;
drop policy if exists dabbir_feedback_insert_self on public.dabbir_feedback;
drop policy if exists dabbir_feedback_select_self on public.dabbir_feedback;

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
