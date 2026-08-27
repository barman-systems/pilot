drop policy if exists dabbir_user_numbers_select_self on public.dabbir_user_numbers;
create policy dabbir_user_numbers_select_self
on public.dabbir_user_numbers
for select
to authenticated
using (user_id = (select auth.uid()));
