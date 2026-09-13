alter table public.dabbir_businesses add column business_type text default 'services';
alter table public.dabbir_services add column name text default 'غسيل كامل', add column name_ar text, add column name_en text, add column duration_minutes int default 30, add column price_aed numeric default 50;
create table public.dabbir_branch_services(business_id uuid,branch_id uuid,service_id uuid,active boolean default true,primary key(business_id,branch_id,service_id));
create table public.dabbir_worker_branches(business_id uuid,branch_id uuid,worker_id uuid,active boolean default true);
create table public.dabbir_worker_services(business_id uuid,service_id uuid,worker_id uuid,active boolean default true);
alter table public.dabbir_appointments add column booking_source text default 'whatsapp', add column location_type text, add column service_latitude double precision, add column service_longitude double precision, add column service_address text;

create table public.dabbir_whatsapp_flow_sessions(id uuid);
create table public.dabbir_whatsapp_event_ledger(id uuid);
create table public.dabbir_home_service_settings(business_id uuid primary key,enabled boolean default false);
