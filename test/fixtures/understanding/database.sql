create schema auth;
create schema dabbir_private;
create role anon;
create role authenticated;
create role service_role;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),current_user)$$;
create table auth.users(id uuid primary key);
create table public.dabbir_businesses(id uuid primary key,timezone text default 'Asia/Dubai');
create table public.dabbir_memberships(business_id uuid,user_id uuid,role text,status text);
create table public.dabbir_customers(id uuid primary key,business_id uuid,unique(business_id,id));
create table public.dabbir_business_branches(id uuid primary key,business_id uuid,status text default 'active',unique(business_id,id));
create table public.dabbir_conversations(id uuid primary key,business_id uuid,customer_id uuid,branch_id uuid,state text default 'ai_active',channel_type text default 'whatsapp',demo_mode boolean default false,unique(business_id,id));
create table public.dabbir_messages(id uuid primary key default gen_random_uuid(),business_id uuid,conversation_id uuid,sender_type text default 'customer',sender_user_id uuid,simulated boolean default false,body text default '',created_at timestamptz default now());
create table public.dabbir_message_batches(id uuid primary key,business_id uuid,conversation_id uuid,customer_id uuid,state text default 'PROCESSING',lock_token uuid,locked_until timestamptz default now()+interval '10 minutes',first_message_at timestamptz default now(),last_message_at timestamptz default now());
create table public.dabbir_message_batch_items(batch_id uuid,business_id uuid,message_id uuid,ordinal int);
create table public.dabbir_ai_conversation_state(business_id uuid,conversation_id uuid,pending_action text default 'none',payload jsonb default '{}',expires_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now(),primary key(business_id,conversation_id));
create table public.dabbir_ai_action_ledger(id uuid primary key default gen_random_uuid(),business_id uuid,conversation_id uuid,operation_key text,operation_type text,entity_id uuid,result jsonb,unique(business_id,operation_key));
create table public.dabbir_customer_memory(id uuid primary key default gen_random_uuid(),business_id uuid,customer_id uuid,memory_key text,value jsonb,source text,confidence numeric,last_seen_at timestamptz,expires_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now(),unique(business_id,customer_id,memory_key),foreign key(business_id,customer_id) references dabbir_customers(business_id,id));
create table public.dabbir_business_knowledge(id uuid primary key default gen_random_uuid(),business_id uuid,knowledge_key text,knowledge_type text,value jsonb,source text,confidence numeric,status text,updated_at timestamptz default now(),unique(business_id,knowledge_key));
create table public.dabbir_services(id uuid primary key,business_id uuid,active boolean default true);
create table public.dabbir_workers(id uuid primary key,business_id uuid,status text default 'active');
create table public.dabbir_handoffs(business_id uuid,conversation_id uuid,state text);
create table public.dabbir_whatsapp_voice_ingest(business_id uuid,conversation_id uuid,message_id uuid,state text,created_at timestamptz default now(),transcription_confidence numeric,clarification_required boolean);
create table public.dabbir_appointments(id uuid primary key default gen_random_uuid(),business_id uuid,branch_id uuid,customer_id uuid,service_id uuid,worker_id uuid,simulated boolean default false,starts_at timestamptz,status text default 'confirmed');
-- Downstream actions are fixture adapters; the V2 scope, authority, state, CAS and RLS SQL is real.
create function public.dabbir_whatsapp_ai_create_booking(b uuid,c uuid,s uuid,w uuid,t timestamptz,k text,n text) returns jsonb language plpgsql as $$
declare a uuid;r jsonb;
begin
 insert into dabbir_appointments(business_id,branch_id,customer_id,service_id,worker_id,starts_at) select b,branch_id,customer_id,s,w,t from dabbir_conversations where id=c and business_id=b returning id into a;
 r:=jsonb_build_object('verified',true,'appointment_id',a,'status','confirmed','starts_at',t);
 insert into dabbir_ai_action_ledger(business_id,conversation_id,operation_key,operation_type,entity_id,result)values(b,c,k,'booking.create',a,r);return r;
end$$;
create function public.dabbir_whatsapp_ai_cancel_booking(b uuid,c uuid,a uuid,k text) returns jsonb language plpgsql as $$
declare r jsonb;
begin update dabbir_appointments set status='cancelled' where id=a and business_id=b;
 r:=jsonb_build_object('verified',true,'appointment_id',a,'status','cancelled');
 insert into dabbir_ai_action_ledger(business_id,conversation_id,operation_key,operation_type,entity_id,result)values(b,c,k,'booking.cancel',a,r);return r;
end$$;
create function public.dabbir_whatsapp_ai_reschedule_booking(b uuid,c uuid,a uuid,t timestamptz,k text) returns jsonb language plpgsql as $$
declare r jsonb;
begin update dabbir_appointments set starts_at=t where id=a and business_id=b;
 r:=jsonb_build_object('verified',true,'appointment_id',a,'status','confirmed','starts_at',t);
 insert into dabbir_ai_action_ledger(business_id,conversation_id,operation_key,operation_type,entity_id,result)values(b,c,k,'booking.reschedule',a,r);return r;
end$$;
create function public.dabbir_whatsapp_ai_set_state(b uuid,c uuid,a text,p jsonb,ttl int) returns jsonb language plpgsql as $$begin
 update dabbir_ai_conversation_state set pending_action=a,payload=p,expires_at=now()+interval '15 minutes' where business_id=b and conversation_id=c;
 return jsonb_build_object('pending_action',a);end$$;
grant usage on schema public,auth to authenticated,anon,service_role;
grant select on public.dabbir_memberships to authenticated;

create table public.dabbir_whatsapp_connections(id uuid primary key,business_id uuid,branch_id uuid,status text,phone_number_id text,updated_at timestamptz default now());
create table public.dabbir_whatsapp_outbound_reservations(id uuid primary key default gen_random_uuid(),business_id uuid,connection_id uuid,conversation_id uuid,sender_user_id uuid,sender_type text,idempotency_key text,payload_hash text,recipient_handle text,body text,state text,external_attempt_started_at timestamptz,provider_message_id text,message_id uuid,error_code text,updated_at timestamptz default now());
alter table public.dabbir_customers add column channel_handle text;

alter table public.dabbir_business_branches add column name text;
create table public.dabbir_car_wash_vehicles(id uuid,business_id uuid,customer_id uuid);
create table public.dabbir_car_wash_booking_requests(id uuid,business_id uuid,customer_id uuid,vehicle_id uuid,status text,starts_at timestamptz,location_lat numeric,location_lng numeric);
