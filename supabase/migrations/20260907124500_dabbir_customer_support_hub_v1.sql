-- DABBIR customer-facing support hub.
-- Extends the existing private Customer 360 support ledger without exposing internal notes.
-- All browser access stays server-mediated; authenticated/anon roles receive no direct table/RPC access.

alter table dabbir_private.platform_customer_support_cases
  add column if not exists customer_visible boolean not null default false,
  add column if not exists origin text not null default 'staff',
  add column if not exists channel text not null default 'internal',
  add column if not exists public_reference text,
  add column if not exists context jsonb not null default '{}'::jsonb;

do $$ begin
  alter table dabbir_private.platform_customer_support_cases
    add constraint platform_customer_support_cases_origin_check check (origin in ('staff','customer'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table dabbir_private.platform_customer_support_cases
    add constraint platform_customer_support_cases_channel_check check (channel in ('internal','in_app','whatsapp','email','phone'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table dabbir_private.platform_customer_support_cases
    add constraint platform_customer_support_cases_context_object_check check (jsonb_typeof(context)='object');
exception when duplicate_object then null; end $$;

create unique index if not exists platform_customer_support_cases_public_reference_idx
  on dabbir_private.platform_customer_support_cases(public_reference)
  where public_reference is not null;
create index if not exists platform_customer_support_cases_customer_visible_idx
  on dabbir_private.platform_customer_support_cases(target_user_id, customer_visible, updated_at desc);

create sequence if not exists dabbir_private.customer_support_reference_seq as bigint start with 1000 increment by 1;
revoke all on sequence dabbir_private.customer_support_reference_seq from public, anon, authenticated;

create table if not exists dabbir_private.platform_customer_support_messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references dabbir_private.platform_customer_support_cases(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  author_kind text not null check (author_kind in ('customer','support','system')),
  body text not null check (char_length(body) between 2 and 4000),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists platform_customer_support_messages_case_idx
  on dabbir_private.platform_customer_support_messages(case_id, created_at asc);
create index if not exists platform_customer_support_messages_actor_idx
  on dabbir_private.platform_customer_support_messages(actor_user_id);
alter table dabbir_private.platform_customer_support_messages enable row level security;
alter table dabbir_private.platform_customer_support_messages force row level security;
revoke all on dabbir_private.platform_customer_support_messages from public, anon, authenticated;

drop policy if exists platform_customer_support_messages_client_deny on dabbir_private.platform_customer_support_messages;
create policy platform_customer_support_messages_client_deny
  on dabbir_private.platform_customer_support_messages
  as restrictive for all to anon, authenticated
  using (false) with check (false);

create or replace function public.dabbir_customer_support_summary(p_actor_user_id uuid, p_business_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_no text;
  v_cases jsonb;
  v_open int;
  v_waiting int;
  v_resolved int;
begin
  select a.customer_no into v_customer_no
  from public.dabbir_user_accounts a
  where a.user_id=p_actor_user_id
  limit 1;
  if v_customer_no is null then raise exception 'DABBIR_CUSTOMER_ACCOUNT_NOT_FOUND'; end if;

  if p_business_id is not null and not exists(
    select 1 from public.dabbir_memberships m
    where m.user_id=p_actor_user_id and m.business_id=p_business_id and m.status='active'
  ) then raise exception 'DABBIR_CUSTOMER_BUSINESS_MISMATCH'; end if;

  select
    count(*) filter (where c.status='open')::int,
    count(*) filter (where c.status='waiting')::int,
    count(*) filter (where c.status='resolved')::int,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id',c.id,
        'reference',c.public_reference,
        'business_id',c.business_id,
        'category',c.category,
        'priority',c.priority,
        'status',c.status,
        'subject',c.subject,
        'channel',c.channel,
        'created_at',c.created_at,
        'updated_at',c.updated_at,
        'resolved_at',c.resolved_at,
        'messages',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',m.id,
            'author_kind',m.author_kind,
            'body',m.body,
            'created_at',m.created_at
          ) order by m.created_at)
          from dabbir_private.platform_customer_support_messages m
          where m.case_id=c.id
        ),'[]'::jsonb)
      ) order by c.updated_at desc
    ),'[]'::jsonb)
  into v_open,v_waiting,v_resolved,v_cases
  from dabbir_private.platform_customer_support_cases c
  where c.target_user_id=p_actor_user_id
    and c.customer_visible=true
    and (p_business_id is null or c.business_id is null or c.business_id=p_business_id);

  return jsonb_build_object(
    'customer_no',v_customer_no,
    'metrics',jsonb_build_object(
      'open',coalesce(v_open,0),
      'waiting',coalesce(v_waiting,0),
      'resolved',coalesce(v_resolved,0),
      'total',coalesce(v_open,0)+coalesce(v_waiting,0)+coalesce(v_resolved,0)
    ),
    'cases',v_cases
  );
end; $$;
revoke all on function public.dabbir_customer_support_summary(uuid,uuid) from public, anon, authenticated;
grant execute on function public.dabbir_customer_support_summary(uuid,uuid) to service_role;

create or replace function public.dabbir_customer_support_create(
  p_actor_user_id uuid,
  p_business_id uuid,
  p_category text,
  p_priority text,
  p_subject text,
  p_message text,
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_no text;
  v_category text;
  v_priority text;
  v_subject text;
  v_message text;
  v_context jsonb;
  v_id uuid;
  v_reference text;
begin
  select a.customer_no into v_customer_no
  from public.dabbir_user_accounts a
  where a.user_id=p_actor_user_id
  limit 1;
  if v_customer_no is null then raise exception 'DABBIR_CUSTOMER_ACCOUNT_NOT_FOUND'; end if;

  if p_business_id is not null and not exists(
    select 1 from public.dabbir_memberships m
    where m.user_id=p_actor_user_id and m.business_id=p_business_id and m.status='active'
  ) then raise exception 'DABBIR_CUSTOMER_BUSINESS_MISMATCH'; end if;

  v_category:=lower(trim(coalesce(p_category,'general')));
  v_priority:=lower(trim(coalesce(p_priority,'normal')));
  v_subject:=trim(coalesce(p_subject,''));
  v_message:=trim(coalesce(p_message,''));
  v_context:=coalesce(p_context,'{}'::jsonb);

  if v_category not in ('general','access','billing','data','recovery','whatsapp','integration','bug','privacy','other') then raise exception 'DABBIR_SUPPORT_INVALID_CATEGORY'; end if;
  if v_priority not in ('normal','high','urgent') then raise exception 'DABBIR_SUPPORT_INVALID_PRIORITY'; end if;
  if char_length(v_subject) not between 3 and 200 then raise exception 'DABBIR_SUPPORT_SUBJECT_REQUIRED'; end if;
  if char_length(v_message) not between 2 and 4000 then raise exception 'DABBIR_SUPPORT_NOTE_INVALID'; end if;
  if jsonb_typeof(v_context) <> 'object' then raise exception 'DABBIR_SUPPORT_CONTEXT_INVALID'; end if;

  v_reference:='SUP-'||lpad(nextval('dabbir_private.customer_support_reference_seq'::regclass)::text,6,'0');

  insert into dabbir_private.platform_customer_support_cases(
    target_user_id,customer_no,business_id,category,priority,status,subject,created_by,
    customer_visible,origin,channel,public_reference,context
  ) values(
    p_actor_user_id,v_customer_no,p_business_id,v_category,v_priority,'open',v_subject,p_actor_user_id,
    true,'customer','in_app',v_reference,v_context
  ) returning id into v_id;

  insert into dabbir_private.platform_customer_support_messages(case_id,actor_user_id,author_kind,body)
  values(v_id,p_actor_user_id,'customer',v_message);

  return jsonb_build_object('id',v_id,'reference',v_reference,'status','open');
end; $$;
revoke all on function public.dabbir_customer_support_create(uuid,uuid,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.dabbir_customer_support_create(uuid,uuid,text,text,text,text,jsonb) to service_role;

create or replace function public.dabbir_customer_support_reply(p_actor_user_id uuid, p_case_id uuid, p_message text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message text;
  v_message_id uuid;
  v_result jsonb;
begin
  v_message:=trim(coalesce(p_message,''));
  if char_length(v_message) not between 2 and 4000 then raise exception 'DABBIR_SUPPORT_NOTE_INVALID'; end if;

  if not exists(
    select 1 from dabbir_private.platform_customer_support_cases c
    where c.id=p_case_id and c.target_user_id=p_actor_user_id and c.customer_visible=true
  ) then raise exception 'DABBIR_SUPPORT_CASE_NOT_FOUND'; end if;

  insert into dabbir_private.platform_customer_support_messages(case_id,actor_user_id,author_kind,body)
  values(p_case_id,p_actor_user_id,'customer',v_message)
  returning id into v_message_id;

  update dabbir_private.platform_customer_support_cases c
  set status='open',updated_at=clock_timestamp(),resolved_at=null
  where c.id=p_case_id
  returning jsonb_build_object('id',c.id,'reference',c.public_reference,'status',c.status,'updated_at',c.updated_at) into v_result;

  return v_result||jsonb_build_object('message_id',v_message_id);
end; $$;
revoke all on function public.dabbir_customer_support_reply(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.dabbir_customer_support_reply(uuid,uuid,text) to service_role;

create or replace function public.dabbir_platform_support_reply_customer(
  p_actor_user_id uuid,
  p_customer_no text,
  p_case_id uuid,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
  v_no text;
  v_message text;
  v_message_id uuid;
  v_business uuid;
  v_result jsonb;
begin
  perform dabbir_private.platform_assert_admin(p_actor_user_id);
  v_no:=upper(trim(coalesce(p_customer_no,'')));
  v_message:=trim(coalesce(p_message,''));
  select a.user_id into v_target from public.dabbir_user_accounts a where a.customer_no=v_no;
  if v_target is null then raise exception 'DABBIR_CUSTOMER_ACCOUNT_NOT_FOUND'; end if;
  if char_length(v_message) not between 2 and 4000 then raise exception 'DABBIR_SUPPORT_NOTE_INVALID'; end if;

  select c.business_id into v_business
  from dabbir_private.platform_customer_support_cases c
  where c.id=p_case_id and c.customer_visible=true
    and (c.target_user_id=v_target or (c.target_user_id is null and c.customer_no=v_no));
  if not found then raise exception 'DABBIR_SUPPORT_CASE_NOT_FOUND'; end if;

  insert into dabbir_private.platform_customer_support_messages(case_id,actor_user_id,author_kind,body)
  values(p_case_id,p_actor_user_id,'support',v_message)
  returning id into v_message_id;

  update dabbir_private.platform_customer_support_cases c
  set status='waiting',updated_at=clock_timestamp(),resolved_at=null,assigned_to=coalesce(c.assigned_to,p_actor_user_id)
  where c.id=p_case_id
  returning jsonb_build_object('id',c.id,'reference',c.public_reference,'status',c.status,'updated_at',c.updated_at) into v_result;

  insert into dabbir_private.platform_customer_admin_audit(actor_user_id,action,target_user_id,target_business_id,details)
  values(p_actor_user_id,'support_customer_reply',v_target,v_business,jsonb_build_object('case_id',p_case_id,'message_id',v_message_id));

  return v_result||jsonb_build_object('message_id',v_message_id);
end; $$;
revoke all on function public.dabbir_platform_support_reply_customer(uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.dabbir_platform_support_reply_customer(uuid,text,uuid,text) to service_role;

-- Keep the staff Customer 360 summary backward-compatible while adding the customer-visible thread.
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
    coalesce(jsonb_agg(jsonb_build_object(
      'id',c.id,'business_id',c.business_id,'category',c.category,'priority',c.priority,'status',c.status,'subject',c.subject,
      'created_at',c.created_at,'updated_at',c.updated_at,'resolved_at',c.resolved_at,
      'customer_visible',c.customer_visible,'origin',c.origin,'channel',c.channel,'reference',c.public_reference,
      'notes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'note',n.note,'created_at',n.created_at,'actor_user_id',n.actor_user_id) order by n.created_at) from dabbir_private.platform_customer_support_notes n where n.case_id=c.id),'[]'::jsonb),
      'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'author_kind',m.author_kind,'body',m.body,'created_at',m.created_at,'actor_user_id',m.actor_user_id) order by m.created_at) from dabbir_private.platform_customer_support_messages m where m.case_id=c.id),'[]'::jsonb)
    ) order by c.created_at desc),'[]'::jsonb)
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
