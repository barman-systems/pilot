-- Isolated PostgreSQL fixture. No network, production credentials or real users.
create schema auth;
create schema dabbir_private;
create role anon;
create role authenticated;
create role service_role;
create function auth.role() returns text language sql as $$ select current_setting('request.jwt.claim.role',true) $$;
set request.jwt.claim.role='service_role';
create table public.dabbir_customers(
 id uuid primary key default gen_random_uuid(),business_id uuid not null,
 display_name text,channel_handle text,phone_e164 text,lead_status text,metadata jsonb default '{}',
 whatsapp_display_name text,display_name_source text default 'system',owner_display_name_updated_at timestamptz,
 created_at timestamptz default now(),updated_at timestamptz default now()
);
create unique index customers_handle on public.dabbir_customers(business_id,channel_handle) where channel_handle is not null;
create unique index customers_phone on public.dabbir_customers(business_id,phone_e164) where phone_e164 is not null;
alter table public.dabbir_customers enable row level security;
create table public.dabbir_whatsapp_connections(
 id uuid primary key default gen_random_uuid(),business_id uuid,branch_id uuid,phone_number_id text,status text,
 coexistence_mode text,coexistence_contacts_synced_at timestamptz,coexistence_message_echo_at timestamptz,
 coexistence_last_event_at timestamptz,updated_at timestamptz default now()
);
create table public.dabbir_conversations(
 id uuid primary key default gen_random_uuid(),business_id uuid,customer_id uuid,channel_type text,state text,demo_mode boolean,branch_id uuid,updated_at timestamptz default now()
);
create table public.dabbir_messages(
 id uuid primary key default gen_random_uuid(),business_id uuid,conversation_id uuid,sender_type text,body text,intent text,simulated boolean,created_at timestamptz default now()
);
create table public.dabbir_whatsapp_event_ledger(
 id uuid primary key default gen_random_uuid(),business_id uuid,connection_id uuid,event_key text,direction text,event_type text,
 provider_message_id text,conversation_id uuid,message_id uuid,provider_status text,provider_verified boolean,
 occurred_at timestamptz,verified_at timestamptz,evidence jsonb,created_at timestamptz default now()
);
create table public.dabbir_message_batches(
 id uuid primary key default gen_random_uuid(),business_id uuid,conversation_id uuid,state text,last_error text,lock_token uuid,locked_until timestamptz,updated_at timestamptz default now()
);
create table public.dabbir_handoffs(id uuid default gen_random_uuid(),business_id uuid,conversation_id uuid,state text);
create table public.dabbir_whatsapp_coexistence_mutations(
 id uuid default gen_random_uuid(),business_id uuid,original_provider_message_id text,applied_at timestamptz,occurred_at timestamptz,
 created_at timestamptz default now(),mutation_type text,new_body text,updated_at timestamptz default now()
);
