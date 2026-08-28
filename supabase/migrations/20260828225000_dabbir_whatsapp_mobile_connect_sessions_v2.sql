-- DABBIR WhatsApp mobile connect sessions v2
-- One-time, short-lived bridge between the native iPhone app and Meta Embedded Signup.
-- The DABBIR user access token and Meta access token are never stored here.
-- A short-lived Meta authorization code may exist only encrypted in captured/completing states
-- and must be erased in terminal consumed/failed states.

create table if not exists public.dabbir_whatsapp_mobile_connect_sessions (
  state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','captured','completing','consumed','failed')),
  redirect_uri text not null check (length(redirect_uri) between 12 and 2048),
  code_ciphertext text,
  code_iv text,
  code_tag text,
  code_key_version text,
  waba_id text,
  phone_number_id text,
  onboarding_mode text not null default 'whatsapp_business_app_onboarding',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at > created_at),
  captured_at timestamptz,
  completing_at timestamptz,
  consumed_at timestamptz,
  failed_at timestamptz,
  last_error text,
  constraint dabbir_whatsapp_mobile_connect_code_shape check (
    (
      status in ('pending','consumed','failed')
      and code_ciphertext is null
      and code_iv is null
      and code_tag is null
      and code_key_version is null
    )
    or
    (
      status in ('captured','completing')
      and code_ciphertext is not null
      and code_iv is not null
      and code_tag is not null
      and code_key_version is not null
    )
  )
);

create index if not exists dabbir_whatsapp_mobile_connect_sessions_user_idx
  on public.dabbir_whatsapp_mobile_connect_sessions(user_id, created_at desc);
create index if not exists dabbir_whatsapp_mobile_connect_sessions_business_idx
  on public.dabbir_whatsapp_mobile_connect_sessions(business_id, created_at desc);
create index if not exists dabbir_whatsapp_mobile_connect_sessions_expiry_idx
  on public.dabbir_whatsapp_mobile_connect_sessions(expires_at);

alter table public.dabbir_whatsapp_mobile_connect_sessions enable row level security;
alter table public.dabbir_whatsapp_mobile_connect_sessions force row level security;

revoke all on table public.dabbir_whatsapp_mobile_connect_sessions from public;
revoke all on table public.dabbir_whatsapp_mobile_connect_sessions from anon;
revoke all on table public.dabbir_whatsapp_mobile_connect_sessions from authenticated;
grant select, insert, update, delete on table public.dabbir_whatsapp_mobile_connect_sessions to service_role;

comment on table public.dabbir_whatsapp_mobile_connect_sessions is
  'Service-only one-time state for native iPhone WhatsApp Embedded Signup. No DABBIR access token or Meta access token is stored. Authorization codes are encrypted transiently and erased on terminal states.';
