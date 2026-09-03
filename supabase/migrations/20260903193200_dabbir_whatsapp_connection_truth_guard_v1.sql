-- A connection is never connected merely because a row exists. The verified Embedded
-- Signup completion path explicitly writes status='connected' together with
-- last_verified_at after Meta authorization succeeds. Any other path must remain
-- verification_required until it can prove that provider check.
alter table public.dabbir_whatsapp_connections
  alter column status set default 'verification_required';

alter table public.dabbir_whatsapp_connections
  drop constraint if exists dabbir_whatsapp_connected_requires_verification;
alter table public.dabbir_whatsapp_connections
  add constraint dabbir_whatsapp_connected_requires_verification
  check(status <> 'connected' or last_verified_at is not null);
