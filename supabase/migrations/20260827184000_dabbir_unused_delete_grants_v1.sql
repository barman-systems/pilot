-- DABBIR unused direct DELETE grants v1
-- Neither table has an authenticated DELETE policy and no runtime path performs a
-- direct delete. Remove the redundant grants so ACLs match the actual contract.

revoke delete on table public.dabbir_businesses from authenticated;
revoke delete on table public.dabbir_conversations from authenticated;
