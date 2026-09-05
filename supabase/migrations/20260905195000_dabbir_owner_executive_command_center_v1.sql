-- DABBIR Owner Executive Command Center v1
-- Additive, fail-closed governance foundation. Keeps ROOT_OWNER/OWNER_DELEGATE authority intact.

alter table public.dabbir_platform_admins
  add column if not exists access_scope jsonb not null default '{"type":"ALL_BUSINESSES"}'::jsonb,
  add column if not exists access_expires_at timestamptz,
  add column if not exists mfa_required boolean not null default false,
  add column if not exists approval_limit_aed numeric(14,2),
  add column if not exists last_access_reviewed_at timestamptz;

alter table public.dabbir_platform_admins drop constraint if exists dabbir_platform_admins_scope_check;
alter table public.dabbir_platform_admins add constraint dabbir_platform_admins_scope_check
check ((access_scope ? 'type') and (access_scope->>'type') in ('ALL_BUSINESSES','ASSIGNED_BUSINESSES_ONLY','SPECIFIC_BUSINESS','SPECIFIC_REGION','OWN_TASKS_ONLY'));

create table if not exists dabbir_private.platform_roles(
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_ar text not null,
  name_en text not null,
  description text not null default '',
  system_role boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists dabbir_private.platform_permissions(
  code text primary key,
  domain text not null,
  risk_level text not null default 'LOW' check (risk_level in ('LOW','MEDIUM','HIGH','CRITICAL')),
  owner_only boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists dabbir_private.platform_role_permissions(
  role_id uuid not null references dabbir_private.platform_roles(id) on delete cascade,
  permission_code text not null references dabbir_private.platform_permissions(code) on delete cascade,
  primary key(role_id,permission_code)
);

create table if not exists dabbir_private.platform_approval_policies(
  id uuid primary key default gen_random_uuid(),
  action_code text not null unique,
  enabled boolean not null default true,
  threshold_aed numeric(14,2),
  required_approver text not null default 'ROOT_OWNER' check(required_approver in ('ROOT_OWNER','EXECUTIVE_ADMIN')),
  step_up_required boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists dabbir_private.platform_approval_requests(
  id uuid primary key default gen_random_uuid(),
  action_code text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  target_type text not null,
  target_id text,
  risk_level text not null default 'HIGH' check(risk_level in ('LOW','MEDIUM','HIGH','CRITICAL')),
  reason text not null,
  before_state jsonb not null default '{}'::jsonb,
  proposed_state jsonb not null default '{}'::jsonb,
  status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED','CHANGES_REQUESTED','CANCELLED','EXECUTED','FAILED')),
  resolved_by uuid references auth.users(id) on delete restrict,
  resolution_note text,
  expires_at timestamptz,
  resolved_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists platform_approval_requests_status_idx on dabbir_private.platform_approval_requests(status,created_at desc);
create index if not exists platform_approval_requests_actor_idx on dabbir_private.platform_approval_requests(actor_user_id,created_at desc);

create table if not exists dabbir_private.platform_tasks(
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  status text not null default 'TODO' check(status in ('BACKLOG','TODO','IN_PROGRESS','BLOCKED','REVIEW','DONE','CANCELLED')),
  priority text not null default 'MEDIUM' check(priority in ('CRITICAL','HIGH','MEDIUM','LOW')),
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  due_at timestamptz,
  evidence_required boolean not null default false,
  evidence jsonb not null default '[]'::jsonb,
  checklist jsonb not null default '[]'::jsonb,
  business_id uuid,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists platform_tasks_assignee_idx on dabbir_private.platform_tasks(assigned_to,status,due_at);
create index if not exists platform_tasks_priority_idx on dabbir_private.platform_tasks(priority,status,created_at desc);

create table if not exists dabbir_private.platform_task_comments(
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references dabbir_private.platform_tasks(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists dabbir_private.platform_notifications(
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid references auth.users(id) on delete cascade,
  category text not null check(category in ('CRITICAL','APPROVAL','TASK','SUPPORT','BILLING','SECURITY','SYSTEM','BUSINESS')),
  severity text not null default 'INFO' check(severity in ('CRITICAL','HIGH','MEDIUM','INFO')),
  title text not null,
  body text not null default '',
  entity_type text,
  entity_id text,
  status text not null default 'UNREAD' check(status in ('UNREAD','READ','DISMISSED','SNOOZED')),
  snoozed_until timestamptz,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists platform_notifications_recipient_idx on dabbir_private.platform_notifications(recipient_user_id,status,created_at desc);

create table if not exists dabbir_private.platform_access_reviews(
  id uuid primary key default gen_random_uuid(),
  reviewer_user_id uuid not null references auth.users(id) on delete restrict,
  target_user_id uuid not null references auth.users(id) on delete restrict,
  authority_role text not null,
  permissions text[] not null default '{}'::text[],
  access_scope jsonb not null default '{}'::jsonb,
  decision text not null check(decision in ('KEEP','REDUCE','SUSPEND','REMOVE')),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create or replace function dabbir_private.platform_admin_is_active(p_user_id uuid)
returns boolean language sql stable set search_path='pg_catalog','public','dabbir_private' as $$
  select exists(
    select 1 from public.dabbir_platform_admins a
    where a.user_id=p_user_id
      and a.active=true and a.revoked_at is null and a.suspended_at is null
      and (a.access_expires_at is null or a.access_expires_at>now())
  )
$$;

create or replace function dabbir_private.platform_scope_allows_business(p_user_id uuid,p_business_id uuid)
returns boolean language plpgsql stable set search_path='pg_catalog','public','dabbir_private' as $$
declare v_scope jsonb; v_type text;
begin
  select access_scope into v_scope from public.dabbir_platform_admins
  where user_id=p_user_id and dabbir_private.platform_admin_is_active(p_user_id);
  if not found then return false; end if;
  v_type:=coalesce(v_scope->>'type','');
  if v_type='ALL_BUSINESSES' then return true; end if;
  if p_business_id is null then return false; end if;
  if v_type='SPECIFIC_BUSINESS' then return (v_scope->>'business_id')::uuid=p_business_id; end if;
  if v_type='ASSIGNED_BUSINESSES_ONLY' then
    return exists(select 1 from jsonb_array_elements_text(coalesce(v_scope->'business_ids','[]'::jsonb)) x where x::uuid=p_business_id);
  end if;
  return false;
exception when others then return false;
end;
$$;

create or replace function dabbir_private.platform_approval_requires_root(p_action_code text,p_amount_aed numeric default null)
returns boolean language sql stable set search_path='pg_catalog','dabbir_private' as $$
  select coalesce((select enabled and required_approver='ROOT_OWNER' and (threshold_aed is null or p_amount_aed is null or p_amount_aed>=threshold_aed)
                   from dabbir_private.platform_approval_policies where action_code=p_action_code),false)
$$;

insert into dabbir_private.platform_roles(code,name_ar,name_en,description) values
('EXECUTIVE_ADMIN','مدير تنفيذي','Executive Admin','Broad operational authority without root ownership'),
('OPERATIONS_MANAGER','مدير العمليات','Operations Manager','Businesses, orders and bookings operations'),
('CUSTOMER_SUPPORT','دعم العملاء','Customer Support','Support and customer conversations'),
('FINANCE','المالية','Finance','Financial reporting and controlled financial operations'),
('GROWTH_SALES','النمو والمبيعات','Growth / Sales','Trials, conversions and growth'),
('TECHNICAL_ADMIN','مدير تقني','Technical Admin','System health, integrations and incidents'),
('VIEWER_AUDITOR','مراجع','Viewer / Auditor','Read-only audit and reporting'),
('CUSTOM','مخصص','Custom','Custom permission set')
on conflict(code) do update set name_ar=excluded.name_ar,name_en=excluded.name_en,description=excluded.description,updated_at=now();

insert into dabbir_private.platform_permissions(code,domain,risk_level,owner_only) values
('businesses.view','businesses','LOW',false),('businesses.create','businesses','MEDIUM',false),('businesses.edit','businesses','MEDIUM',false),('businesses.suspend','businesses','HIGH',false),('businesses.delete','businesses','CRITICAL',true),
('customers.view','customers','LOW',false),('customers.edit','customers','MEDIUM',false),
('orders.view','orders','LOW',false),('orders.edit','orders','MEDIUM',false),('orders.refund','orders','HIGH',false),
('bookings.view','bookings','LOW',false),('bookings.edit','bookings','MEDIUM',false),('bookings.cancel','bookings','HIGH',false),
('payments.view','payments','MEDIUM',false),('payments.refund','payments','HIGH',false),
('subscriptions.view','subscriptions','LOW',false),('subscriptions.modify','subscriptions','HIGH',false),('subscriptions.cancel','subscriptions','HIGH',false),
('support.view','support','LOW',false),('support.reply','support','MEDIUM',false),('support.assign','support','MEDIUM',false),('support.close','support','MEDIUM',false),
('team.view','team','MEDIUM',false),('team.invite','team','HIGH',false),('team.edit','team','HIGH',false),('team.remove','team','CRITICAL',true),
('system.view','system','MEDIUM',false),('system.configure','system','CRITICAL',true),
('security.view','security','HIGH',false),('security.manage','security','CRITICAL',true),
('audit.view','audit','HIGH',false),('reports.view','reports','LOW',false),('reports.export','reports','HIGH',false),
('approvals.request','approvals','MEDIUM',false),('approvals.approve','approvals','CRITICAL',true),
('tasks.view','tasks','LOW',false),('tasks.create','tasks','MEDIUM',false),('tasks.assign','tasks','MEDIUM',false),('tasks.complete','tasks','MEDIUM',false)
on conflict(code) do update set domain=excluded.domain,risk_level=excluded.risk_level,owner_only=excluded.owner_only;

insert into dabbir_private.platform_approval_policies(action_code,threshold_aed,required_approver,step_up_required) values
('payments.refund',500,'ROOT_OWNER',true),
('businesses.delete',null,'ROOT_OWNER',true),
('team.remove',null,'ROOT_OWNER',true),
('security.manage',null,'ROOT_OWNER',true),
('reports.export_all_customers',null,'ROOT_OWNER',true),
('system.production_config',null,'ROOT_OWNER',true)
on conflict(action_code) do nothing;

revoke all on all tables in schema dabbir_private from anon, authenticated;
revoke all on all functions in schema dabbir_private from anon, authenticated;
