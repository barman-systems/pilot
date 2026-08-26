-- DABBIR Phase 2 privacy/data-lifecycle foundation.
-- This migration creates governance and request workflows only. It does NOT execute exports/deletions
-- and does NOT authorize real patient data. Patient-data approval remains server/governance controlled.

create table if not exists public.dabbir_data_categories (
  category text primary key,
  classification text not null check (classification in ('PUBLIC','INTERNAL','CONFIDENTIAL','PERSONAL','SENSITIVE')),
  requires_legal_gate boolean not null default false,
  description text not null,
  created_at timestamptz not null default now()
);

insert into public.dabbir_data_categories(category,classification,requires_legal_gate,description) values
  ('BUSINESS_PROFILE','INTERNAL',false,'Business profile and operating configuration'),
  ('CUSTOMER_PROFILE','PERSONAL',false,'Customer profile and contact-linked business records'),
  ('CUSTOMER_IDENTITY','PERSONAL',false,'Verified or channel-linked customer identifiers'),
  ('CONVERSATION','PERSONAL',false,'Conversation-level customer context'),
  ('MESSAGE','PERSONAL',false,'Original customer and business messages'),
  ('APPOINTMENT','PERSONAL',false,'Scheduling and appointment records'),
  ('TASK','INTERNAL',false,'Business operational tasks'),
  ('AUDIT','CONFIDENTIAL',false,'Security and operational audit evidence'),
  ('INTEGRATION_EVENT','CONFIDENTIAL',false,'External integration event metadata'),
  ('AI_RUN','CONFIDENTIAL',false,'AI execution metadata and evaluation evidence'),
  ('ANALYTICS','INTERNAL',false,'Aggregated business operational analytics'),
  ('PATIENT_DATA','SENSITIVE',true,'Patient or health-related data; production use requires explicit legal/privacy/security approval')
on conflict (category) do update set
  classification=excluded.classification,
  requires_legal_gate=excluded.requires_legal_gate,
  description=excluded.description;

alter table public.dabbir_data_categories enable row level security;
alter table public.dabbir_data_categories force row level security;
revoke all on public.dabbir_data_categories from anon, authenticated;
grant select on public.dabbir_data_categories to authenticated;
drop policy if exists dabbir_data_categories_select on public.dabbir_data_categories;
create policy dabbir_data_categories_select on public.dabbir_data_categories for select to authenticated using (true);

create table if not exists public.dabbir_retention_policies (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  data_category text not null references public.dabbir_data_categories(category) on delete restrict,
  retention_days integer check (retention_days is null or retention_days between 1 and 3650),
  policy_state text not null default 'UNCONFIGURED' check (policy_state in ('UNCONFIGURED','ACTIVE','LEGAL_HOLD')),
  source text not null default 'BUSINESS_POLICY' check (source in ('BUSINESS_POLICY','LEGAL_REVIEW','SYSTEM')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,data_category)
);

alter table public.dabbir_retention_policies enable row level security;
alter table public.dabbir_retention_policies force row level security;
revoke all on public.dabbir_retention_policies from anon, authenticated;
grant select,insert,update on public.dabbir_retention_policies to authenticated;
drop policy if exists dabbir_retention_policies_select on public.dabbir_retention_policies;
drop policy if exists dabbir_retention_policies_insert on public.dabbir_retention_policies;
drop policy if exists dabbir_retention_policies_update on public.dabbir_retention_policies;
create policy dabbir_retention_policies_select on public.dabbir_retention_policies for select to authenticated
  using (dabbir_private.has_permission(business_id,'manage_business'));
create policy dabbir_retention_policies_insert on public.dabbir_retention_policies for insert to authenticated
  with check (dabbir_private.has_permission(business_id,'manage_business'));
create policy dabbir_retention_policies_update on public.dabbir_retention_policies for update to authenticated
  using (dabbir_private.has_permission(business_id,'manage_business'))
  with check (dabbir_private.has_permission(business_id,'manage_business'));

create table if not exists public.dabbir_privacy_controls (
  business_id uuid primary key references public.dabbir_businesses(id) on delete cascade,
  patient_data_mode text not null default 'SYNTHETIC_ONLY' check (patient_data_mode in ('SYNTHETIC_ONLY','REVIEW_PENDING','APPROVED')),
  legal_review_status text not null default 'PENDING' check (legal_review_status in ('PENDING','APPROVED','REJECTED')),
  privacy_review_status text not null default 'PENDING' check (privacy_review_status in ('PENDING','APPROVED','REJECTED')),
  security_review_status text not null default 'PENDING' check (security_review_status in ('PENDING','APPROVED','REJECTED')),
  retention_review_status text not null default 'PENDING' check (retention_review_status in ('PENDING','APPROVED','REJECTED')),
  cross_border_review_status text not null default 'PENDING' check (cross_border_review_status in ('PENDING','APPROVED','REJECTED')),
  vendor_ai_review_status text not null default 'PENDING' check (vendor_ai_review_status in ('PENDING','APPROVED','REJECTED')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dabbir_privacy_controls enable row level security;
alter table public.dabbir_privacy_controls force row level security;
revoke all on public.dabbir_privacy_controls from anon, authenticated;
grant select on public.dabbir_privacy_controls to authenticated;
drop policy if exists dabbir_privacy_controls_select on public.dabbir_privacy_controls;
create policy dabbir_privacy_controls_select on public.dabbir_privacy_controls for select to authenticated
  using (dabbir_private.has_permission(business_id,'manage_business'));

create or replace view public.dabbir_patient_data_gate
with (security_invoker=true)
as
select
  b.id as business_id,
  b.business_type,
  c.patient_data_mode,
  c.legal_review_status,
  c.privacy_review_status,
  c.security_review_status,
  c.retention_review_status,
  c.cross_border_review_status,
  c.vendor_ai_review_status,
  (
    b.business_type='clinic'
    and c.patient_data_mode='APPROVED'
    and c.legal_review_status='APPROVED'
    and c.privacy_review_status='APPROVED'
    and c.security_review_status='APPROVED'
    and c.retention_review_status='APPROVED'
    and c.cross_border_review_status='APPROVED'
    and c.vendor_ai_review_status='APPROVED'
  ) as production_patient_data_allowed
from public.dabbir_businesses b
join public.dabbir_privacy_controls c on c.business_id=b.id;
revoke all on public.dabbir_patient_data_gate from anon;
grant select on public.dabbir_patient_data_gate to authenticated;

create table if not exists public.dabbir_customer_consents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  customer_id uuid not null,
  purpose text not null check (purpose in ('SERVICE_DELIVERY','APPOINTMENT_MANAGEMENT','CUSTOMER_SUPPORT','MARKETING','AI_ASSISTED_PROCESSING','ANALYTICS')),
  status text not null default 'UNKNOWN' check (status in ('GRANTED','WITHDRAWN','NOT_REQUIRED','UNKNOWN')),
  source text not null default 'SYSTEM' check (source in ('CUSTOMER','BUSINESS_POLICY','SYSTEM','IMPORTED')),
  evidence_ref text check (evidence_ref is null or length(evidence_ref) <= 512),
  captured_at timestamptz,
  withdrawn_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,customer_id,purpose),
  constraint dabbir_customer_consents_business_customer_fk foreign key (business_id,customer_id)
    references public.dabbir_customers(business_id,id) on delete cascade
);

alter table public.dabbir_customer_consents enable row level security;
alter table public.dabbir_customer_consents force row level security;
revoke all on public.dabbir_customer_consents from anon, authenticated;
grant select,insert,update on public.dabbir_customer_consents to authenticated;
drop policy if exists dabbir_customer_consents_select on public.dabbir_customer_consents;
drop policy if exists dabbir_customer_consents_insert on public.dabbir_customer_consents;
drop policy if exists dabbir_customer_consents_update on public.dabbir_customer_consents;
create policy dabbir_customer_consents_select on public.dabbir_customer_consents for select to authenticated
  using (dabbir_private.has_permission(business_id,'view_customers'));
create policy dabbir_customer_consents_insert on public.dabbir_customer_consents for insert to authenticated
  with check (dabbir_private.has_permission(business_id,'edit_customers'));
create policy dabbir_customer_consents_update on public.dabbir_customer_consents for update to authenticated
  using (dabbir_private.has_permission(business_id,'edit_customers'))
  with check (dabbir_private.has_permission(business_id,'edit_customers'));

create table if not exists public.dabbir_privacy_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  customer_id uuid,
  request_type text not null check (request_type in ('BUSINESS_EXPORT','BUSINESS_DELETE','CUSTOMER_EXPORT','CUSTOMER_DELETE')),
  status text not null default 'REQUESTED' check (status in ('REQUESTED','REVIEW_REQUIRED','APPROVED','PROCESSING','COMPLETED','REJECTED','FAILED','CANCELLED')),
  requested_by uuid default auth.uid(),
  correlation_id text check (correlation_id is null or correlation_id ~ '^[A-Za-z0-9._:-]{8,120}$'),
  request_scope jsonb not null default '{}'::jsonb check (octet_length(request_scope::text) <= 8192),
  result_ref text check (result_ref is null or length(result_ref) <= 1024),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint dabbir_privacy_requests_scope_check check (
    (request_type in ('BUSINESS_EXPORT','BUSINESS_DELETE') and customer_id is null)
    or (request_type in ('CUSTOMER_EXPORT','CUSTOMER_DELETE') and customer_id is not null)
  ),
  constraint dabbir_privacy_requests_business_customer_fk foreign key (business_id,customer_id)
    references public.dabbir_customers(business_id,id) on delete restrict
);

alter table public.dabbir_privacy_requests enable row level security;
alter table public.dabbir_privacy_requests force row level security;
revoke all on public.dabbir_privacy_requests from anon, authenticated;
grant select,insert on public.dabbir_privacy_requests to authenticated;
drop policy if exists dabbir_privacy_requests_select on public.dabbir_privacy_requests;
drop policy if exists dabbir_privacy_requests_insert on public.dabbir_privacy_requests;
create policy dabbir_privacy_requests_select on public.dabbir_privacy_requests for select to authenticated
  using (requested_by=(select auth.uid()) or dabbir_private.has_permission(business_id,'export_data'));
create policy dabbir_privacy_requests_insert on public.dabbir_privacy_requests for insert to authenticated
  with check (
    requested_by=(select auth.uid()) and (
      (request_type='BUSINESS_DELETE' and exists(
        select 1 from public.dabbir_memberships m
        where m.business_id=dabbir_privacy_requests.business_id
          and m.user_id=(select auth.uid()) and m.role='owner'
      ))
      or (request_type<>'BUSINESS_DELETE' and dabbir_private.has_permission(business_id,'export_data'))
    )
  );

create table if not exists public.dabbir_privacy_audit (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.dabbir_businesses(id) on delete cascade,
  actor_user_id uuid,
  action text not null,
  target_type text not null,
  target_id text,
  privacy_request_id uuid references public.dabbir_privacy_requests(id) on delete set null,
  correlation_id text check (correlation_id is null or correlation_id ~ '^[A-Za-z0-9._:-]{8,120}$'),
  metadata jsonb not null default '{}'::jsonb check (octet_length(metadata::text) <= 8192),
  created_at timestamptz not null default now()
);

alter table public.dabbir_privacy_audit enable row level security;
alter table public.dabbir_privacy_audit force row level security;
revoke all on public.dabbir_privacy_audit from anon, authenticated;
grant select on public.dabbir_privacy_audit to authenticated;
drop policy if exists dabbir_privacy_audit_select on public.dabbir_privacy_audit;
create policy dabbir_privacy_audit_select on public.dabbir_privacy_audit for select to authenticated
  using (dabbir_private.has_permission(business_id,'manage_business'));

create or replace function dabbir_private.set_updated_at()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  new.updated_at=now();
  return new;
end;
$$;
revoke all on function dabbir_private.set_updated_at() from public,anon,authenticated;

drop trigger if exists dabbir_retention_policies_touch on public.dabbir_retention_policies;
create trigger dabbir_retention_policies_touch before update on public.dabbir_retention_policies
for each row execute function dabbir_private.set_updated_at();
drop trigger if exists dabbir_customer_consents_touch on public.dabbir_customer_consents;
create trigger dabbir_customer_consents_touch before update on public.dabbir_customer_consents
for each row execute function dabbir_private.set_updated_at();

create or replace function dabbir_private.audit_privacy_row()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_row jsonb := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_business_id uuid := nullif(v_row->>'business_id','')::uuid;
  v_target_id text := v_row->>'id';
  v_request_id uuid := case when tg_table_name='dabbir_privacy_requests' then nullif(v_row->>'id','')::uuid else null end;
  v_metadata jsonb := '{}'::jsonb;
begin
  if tg_table_name='dabbir_privacy_requests' then
    v_metadata=jsonb_build_object('request_type',v_row->>'request_type','status',v_row->>'status');
  elsif tg_table_name='dabbir_customer_consents' then
    v_metadata=jsonb_build_object('purpose',v_row->>'purpose','status',v_row->>'status','source',v_row->>'source');
  elsif tg_table_name='dabbir_retention_policies' then
    v_metadata=jsonb_build_object('data_category',v_row->>'data_category','policy_state',v_row->>'policy_state');
  end if;
  insert into public.dabbir_privacy_audit(business_id,actor_user_id,action,target_type,target_id,privacy_request_id,correlation_id,metadata)
  values(v_business_id,(select auth.uid()),tg_table_name||'_'||lower(tg_op),tg_table_name,v_target_id,v_request_id,v_row->>'correlation_id',v_metadata);
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function dabbir_private.audit_privacy_row() from public,anon,authenticated;

drop trigger if exists dabbir_privacy_requests_audit on public.dabbir_privacy_requests;
create trigger dabbir_privacy_requests_audit after insert or update on public.dabbir_privacy_requests
for each row execute function dabbir_private.audit_privacy_row();
drop trigger if exists dabbir_customer_consents_audit on public.dabbir_customer_consents;
create trigger dabbir_customer_consents_audit after insert or update on public.dabbir_customer_consents
for each row execute function dabbir_private.audit_privacy_row();
drop trigger if exists dabbir_retention_policies_audit on public.dabbir_retention_policies;
create trigger dabbir_retention_policies_audit after insert or update on public.dabbir_retention_policies
for each row execute function dabbir_private.audit_privacy_row();

create or replace function dabbir_private.seed_privacy_defaults()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.dabbir_privacy_controls(business_id) values(new.id) on conflict(business_id) do nothing;
  insert into public.dabbir_retention_policies(business_id,data_category)
  select new.id,c.category from public.dabbir_data_categories c
  on conflict(business_id,data_category) do nothing;
  return new;
end;
$$;
revoke all on function dabbir_private.seed_privacy_defaults() from public,anon,authenticated;

drop trigger if exists dabbir_businesses_seed_privacy on public.dabbir_businesses;
create trigger dabbir_businesses_seed_privacy after insert on public.dabbir_businesses
for each row execute function dabbir_private.seed_privacy_defaults();

insert into public.dabbir_privacy_controls(business_id)
select id from public.dabbir_businesses
on conflict(business_id) do nothing;
insert into public.dabbir_retention_policies(business_id,data_category)
select b.id,c.category from public.dabbir_businesses b cross join public.dabbir_data_categories c
on conflict(business_id,data_category) do nothing;

create index if not exists dabbir_retention_policies_business_state_idx on public.dabbir_retention_policies(business_id,policy_state);
create index if not exists dabbir_customer_consents_business_customer_idx on public.dabbir_customer_consents(business_id,customer_id);
create index if not exists dabbir_privacy_requests_business_status_idx on public.dabbir_privacy_requests(business_id,status,requested_at desc);
create index if not exists dabbir_privacy_requests_customer_idx on public.dabbir_privacy_requests(business_id,customer_id) where customer_id is not null;
create index if not exists dabbir_privacy_audit_business_created_idx on public.dabbir_privacy_audit(business_id,created_at desc);

comment on table public.dabbir_data_categories is 'DABBIR data classification catalog. PATIENT_DATA is SENSITIVE and requires a hard legal/privacy/security gate.';
comment on table public.dabbir_retention_policies is 'Retention configuration. UNCONFIGURED means no automatic retention/deletion execution may be assumed.';
comment on table public.dabbir_privacy_controls is 'Server/governance-controlled privacy gates. Authenticated clients have read-only access.';
comment on table public.dabbir_privacy_requests is 'Privacy request intake only. No export/delete is considered complete until a server-side executor verifies completion.';
comment on table public.dabbir_privacy_audit is 'Append-only privacy lifecycle audit generated by controlled triggers; no direct authenticated writes.';
comment on view public.dabbir_patient_data_gate is 'Clinic patient-data production gate. TRUE only after every required review is APPROVED and patient_data_mode is APPROVED.';
