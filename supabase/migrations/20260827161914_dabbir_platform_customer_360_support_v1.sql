-- DABBIR platform Customer 360 support ledger.
-- Internal-only support cases and notes; customer roles receive no direct table or RPC access.

create table dabbir_private.platform_customer_support_cases (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid references auth.users(id) on delete set null,
  customer_no text not null check (customer_no ~ '^DAB-[0-9]{6,}$'),
  business_id uuid references public.dabbir_businesses(id) on delete set null,
  category text not null default 'general' check (category in ('general','access','billing','data','recovery','whatsapp','integration','bug','abuse','privacy','other')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','waiting','resolved')),
  subject text not null check (char_length(subject) between 3 and 200),
  created_by uuid references auth.users(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz
);
create index platform_customer_support_cases_target_idx on dabbir_private.platform_customer_support_cases(target_user_id, created_at desc);
create index platform_customer_support_cases_status_idx on dabbir_private.platform_customer_support_cases(status, priority, created_at desc);
alter table dabbir_private.platform_customer_support_cases enable row level security;
alter table dabbir_private.platform_customer_support_cases force row level security;
revoke all on dabbir_private.platform_customer_support_cases from public, anon, authenticated;

create table dabbir_private.platform_customer_support_notes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references dabbir_private.platform_customer_support_cases(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  note text not null check (char_length(note) between 2 and 4000),
  created_at timestamptz not null default clock_timestamp()
);
create index platform_customer_support_notes_case_idx on dabbir_private.platform_customer_support_notes(case_id, created_at asc);
alter table dabbir_private.platform_customer_support_notes enable row level security;
alter table dabbir_private.platform_customer_support_notes force row level security;
revoke all on dabbir_private.platform_customer_support_notes from public, anon, authenticated;

create or replace function public.dabbir_platform_support_summary(p_actor_user_id uuid, p_customer_no text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_target uuid; v_no text; v_cases jsonb; v_timeline jsonb; v_open int; v_waiting int; v_resolved int;
begin
  perform dabbir_private.platform_assert_admin(p_actor_user_id);
  v_no := upper(trim(coalesce(p_customer_no,'')));
  select a.user_id into v_target from public.dabbir_user_accounts a where a.customer_no=v_no;
  if v_target is null then raise exception 'DABBIR_CUSTOMER_ACCOUNT_NOT_FOUND'; end if;
  select count(*) filter (where c.status='open')::int, count(*) filter (where c.status='waiting')::int, count(*) filter (where c.status='resolved')::int,
    coalesce(jsonb_agg(jsonb_build_object('id',c.id,'business_id',c.business_id,'category',c.category,'priority',c.priority,'status',c.status,'subject',c.subject,'created_at',c.created_at,'updated_at',c.updated_at,'resolved_at',c.resolved_at,'notes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'note',n.note,'created_at',n.created_at,'actor_user_id',n.actor_user_id) order by n.created_at) from dabbir_private.platform_customer_support_notes n where n.case_id=c.id),'[]'::jsonb)) order by c.created_at desc),'[]'::jsonb)
  into v_open,v_waiting,v_resolved,v_cases
  from dabbir_private.platform_customer_support_cases c where c.target_user_id=v_target or (c.target_user_id is null and c.customer_no=v_no);
  select coalesce(jsonb_agg(x.item order by x.created_at desc),'[]'::jsonb) into v_timeline from (
    select jsonb_build_object('action',a.action,'business_id',a.target_business_id,'details',a.details,'created_at',a.created_at) item, a.created_at
    from dabbir_private.platform_customer_admin_audit a where a.target_user_id=v_target and a.action <> 'customer_search' order by a.created_at desc limit 25
  ) x;
  return jsonb_build_object('customer_no',v_no,'user_id',v_target,'metrics',jsonb_build_object('open',coalesce(v_open,0),'waiting',coalesce(v_waiting,0),'resolved',coalesce(v_resolved,0),'total',coalesce(v_open,0)+coalesce(v_waiting,0)+coalesce(v_resolved,0)),'cases',v_cases,'timeline',v_timeline);
end; $$;
revoke all on function public.dabbir_platform_support_summary(uuid,text) from public, anon, authenticated;
grant execute on function public.dabbir_platform_support_summary(uuid,text) to service_role;

create or replace function public.dabbir_platform_support_create(p_actor_user_id uuid, p_customer_no text, p_business_id uuid, p_category text, p_priority text, p_subject text, p_initial_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_target uuid; v_no text; v_id uuid; v_category text; v_priority text; v_subject text; v_note text;
begin
  perform dabbir_private.platform_assert_admin(p_actor_user_id);
  v_no:=upper(trim(coalesce(p_customer_no,''))); v_category:=lower(trim(coalesce(p_category,'general'))); v_priority:=lower(trim(coalesce(p_priority,'normal'))); v_subject:=trim(coalesce(p_subject,'')); v_note:=nullif(trim(coalesce(p_initial_note,'')),'');
  select a.user_id into v_target from public.dabbir_user_accounts a where a.customer_no=v_no;
  if v_target is null then raise exception 'DABBIR_CUSTOMER_ACCOUNT_NOT_FOUND'; end if;
  if v_category not in ('general','access','billing','data','recovery','whatsapp','integration','bug','abuse','privacy','other') then raise exception 'DABBIR_SUPPORT_INVALID_CATEGORY'; end if;
  if v_priority not in ('low','normal','high','urgent') then raise exception 'DABBIR_SUPPORT_INVALID_PRIORITY'; end if;
  if char_length(v_subject) not between 3 and 200 then raise exception 'DABBIR_SUPPORT_SUBJECT_REQUIRED'; end if;
  if p_business_id is not null and not exists(select 1 from public.dabbir_memberships m where m.user_id=v_target and m.business_id=p_business_id) then raise exception 'DABBIR_CUSTOMER_BUSINESS_MISMATCH'; end if;
  if v_note is not null and char_length(v_note) not between 2 and 4000 then raise exception 'DABBIR_SUPPORT_NOTE_INVALID'; end if;
  insert into dabbir_private.platform_customer_support_cases(target_user_id,customer_no,business_id,category,priority,subject,created_by,assigned_to) values(v_target,v_no,p_business_id,v_category,v_priority,v_subject,p_actor_user_id,p_actor_user_id) returning id into v_id;
  if v_note is not null then insert into dabbir_private.platform_customer_support_notes(case_id,actor_user_id,note) values(v_id,p_actor_user_id,v_note); end if;
  insert into dabbir_private.platform_customer_admin_audit(actor_user_id,action,target_user_id,target_business_id,details) values(p_actor_user_id,'support_case_created',v_target,p_business_id,jsonb_build_object('case_id',v_id,'category',v_category,'priority',v_priority));
  return v_id;
end; $$;
revoke all on function public.dabbir_platform_support_create(uuid,text,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.dabbir_platform_support_create(uuid,text,uuid,text,text,text,text) to service_role;

create or replace function public.dabbir_platform_support_add_note(p_actor_user_id uuid, p_customer_no text, p_case_id uuid, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_target uuid; v_no text; v_note text; v_note_id uuid; v_business uuid;
begin
  perform dabbir_private.platform_assert_admin(p_actor_user_id);
  v_no:=upper(trim(coalesce(p_customer_no,''))); v_note:=trim(coalesce(p_note,''));
  select a.user_id into v_target from public.dabbir_user_accounts a where a.customer_no=v_no;
  if v_target is null then raise exception 'DABBIR_CUSTOMER_ACCOUNT_NOT_FOUND'; end if;
  if char_length(v_note) not between 2 and 4000 then raise exception 'DABBIR_SUPPORT_NOTE_INVALID'; end if;
  select c.business_id into v_business from dabbir_private.platform_customer_support_cases c where c.id=p_case_id and (c.target_user_id=v_target or (c.target_user_id is null and c.customer_no=v_no));
  if not found then raise exception 'DABBIR_SUPPORT_CASE_NOT_FOUND'; end if;
  insert into dabbir_private.platform_customer_support_notes(case_id,actor_user_id,note) values(p_case_id,p_actor_user_id,v_note) returning id into v_note_id;
  update dabbir_private.platform_customer_support_cases c set updated_at=clock_timestamp() where c.id=p_case_id;
  insert into dabbir_private.platform_customer_admin_audit(actor_user_id,action,target_user_id,target_business_id,details) values(p_actor_user_id,'support_note_added',v_target,v_business,jsonb_build_object('case_id',p_case_id,'note_id',v_note_id));
  return v_note_id;
end; $$;
revoke all on function public.dabbir_platform_support_add_note(uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.dabbir_platform_support_add_note(uuid,text,uuid,text) to service_role;

create or replace function public.dabbir_platform_support_set_status(p_actor_user_id uuid, p_customer_no text, p_case_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_target uuid; v_no text; v_status text; v_business uuid; v_result jsonb;
begin
  perform dabbir_private.platform_assert_admin(p_actor_user_id);
  v_no:=upper(trim(coalesce(p_customer_no,''))); v_status:=lower(trim(coalesce(p_status,'')));
  select a.user_id into v_target from public.dabbir_user_accounts a where a.customer_no=v_no;
  if v_target is null then raise exception 'DABBIR_CUSTOMER_ACCOUNT_NOT_FOUND'; end if;
  if v_status not in ('open','waiting','resolved') then raise exception 'DABBIR_SUPPORT_INVALID_STATUS'; end if;
  select c.business_id into v_business from dabbir_private.platform_customer_support_cases c where c.id=p_case_id and (c.target_user_id=v_target or (c.target_user_id is null and c.customer_no=v_no));
  if not found then raise exception 'DABBIR_SUPPORT_CASE_NOT_FOUND'; end if;
  update dabbir_private.platform_customer_support_cases c set status=v_status,updated_at=clock_timestamp(),resolved_at=case when v_status='resolved' then coalesce(c.resolved_at,clock_timestamp()) else null end where c.id=p_case_id returning jsonb_build_object('id',c.id,'status',c.status,'updated_at',c.updated_at,'resolved_at',c.resolved_at) into v_result;
  insert into dabbir_private.platform_customer_admin_audit(actor_user_id,action,target_user_id,target_business_id,details) values(p_actor_user_id,'support_case_status_changed',v_target,v_business,jsonb_build_object('case_id',p_case_id,'status',v_status));
  return v_result;
end; $$;
revoke all on function public.dabbir_platform_support_set_status(uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.dabbir_platform_support_set_status(uuid,text,uuid,text) to service_role;
