-- DABBIR team direct-write hardening v1
-- Keep first-owner bootstrap working, but force all later team mutations through guarded RPCs.

-- First-owner bootstrap uses SECURITY INVOKER dabbir_create_business and therefore
-- still requires authenticated INSERT on dabbir_memberships. Direct UPDATE is not
-- required by the runtime; role/status/permission changes go through guarded RPCs.
revoke update on table public.dabbir_memberships from authenticated;
drop policy if exists dabbir_memberships_team_update on public.dabbir_memberships;

-- Invitation creation/acceptance/revocation is implemented by SECURITY DEFINER RPCs.
-- Authenticated clients only need tenant-scoped read access to list invitations.
revoke insert, update, delete, truncate, references, trigger
on table public.dabbir_employee_invitations from authenticated;

-- Preserve the minimal intended client grants explicitly.
grant select, insert on table public.dabbir_memberships to authenticated;
grant select on table public.dabbir_employee_invitations to authenticated;
