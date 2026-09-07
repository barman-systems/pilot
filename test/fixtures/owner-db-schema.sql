-- Minimal table structure from production catalog; synthetic test rows only.
CREATE SCHEMA dabbir_private; CREATE SCHEMA auth; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE dabbir_private.dabbir_ceo_commands ("id" uuid, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "created_by" uuid, "command_text" text, "priority" text, "status" text, "source" text, "result_summary" text, "evidence" jsonb, "objective" text, "acceptance_criteria" jsonb, "due_at" timestamp with time zone, "guidance" jsonb, "claimed_at" timestamp with time zone, "blocked_reason" text, "attempt_count" integer, "lease_until" timestamp with time zone, "worker_id" text, "execution_lane" text, "execution_plan" jsonb, "last_error" text, "completed_at" timestamp with time zone, "parent_command_id" uuid, "orchestration_state" text, "risk_level" text, "autonomy_level" text, "verification_status" text, "idempotency_key" text, "rollback_plan" jsonb);
CREATE TABLE dabbir_private.executive_escalations ("id" uuid, "action_id" uuid, "event_id" uuid, "category" text, "status" text, "question" text, "decision" jsonb, "created_at" timestamp with time zone, "resolved_at" timestamp with time zone);
CREATE TABLE dabbir_private.executive_events ("id" uuid, "fingerprint" text, "source" text, "kind" text, "severity" text, "status" text, "project_key" text, "external_ref" text, "summary" text, "payload" jsonb, "detected_at" timestamp with time zone, "resolved_at" timestamp with time zone);
CREATE TABLE dabbir_private.platform_customer_admin_audit ("id" uuid, "actor_user_id" uuid, "action" text, "target_user_id" uuid, "target_business_id" uuid, "recovery_case_id" uuid, "details" jsonb, "created_at" timestamp with time zone);
CREATE TABLE dabbir_private.platform_customer_support_cases ("id" uuid, "target_user_id" uuid, "customer_no" text, "business_id" uuid, "category" text, "priority" text, "status" text, "subject" text, "created_by" uuid, "assigned_to" uuid, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "resolved_at" timestamp with time zone, "source_key" text, "sla_due_at" timestamp with time zone, "diagnostic" text, "resolution" text);
CREATE TABLE dabbir_private.platform_customer_support_notes ("id" uuid, "case_id" uuid, "actor_user_id" uuid, "note" text, "created_at" timestamp with time zone);
CREATE TABLE dabbir_private.platform_permissions ("code" text, "domain" text, "risk_level" text, "owner_only" boolean, "created_at" timestamp with time zone);
CREATE TABLE dabbir_private.platform_staff_audit ("id" uuid, "actor_user_id" uuid, "target_user_id" uuid, "action" text, "reason" text, "before_state" jsonb, "after_state" jsonb, "result" text, "metadata" jsonb, "created_at" timestamp with time zone);
CREATE TABLE public.dabbir_billing_accounts ("business_id" uuid, "stripe_customer_id" text, "stripe_subscription_id" text, "stripe_price_id" text, "status" text, "trial_started_at" timestamp with time zone, "trial_ends_at" timestamp with time zone, "current_period_ends_at" timestamp with time zone, "cancel_at_period_end" boolean, "canceled_at" timestamp with time zone, "latest_invoice_id" text, "last_invoice_status" text, "stripe_updated_at" timestamp with time zone, "created_at" timestamp with time zone, "updated_at" timestamp with time zone);
CREATE TABLE public.dabbir_businesses ("id" uuid, "slug" text, "name" text, "business_type" text, "owner_id" uuid, "locale" text, "demo_mode" boolean, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "country_code" text, "currency_code" text, "timezone" text, "phone_country_prefix" text, "vat_status" text, "default_vat_rate" numeric(5,2));
CREATE TABLE public.dabbir_calendar_connections ("id" uuid, "business_id" uuid, "provider" text, "provider_account_id" text, "provider_email" text, "provider_display_name" text, "calendar_id" text, "sync_direction" text, "sync_enabled" boolean, "status" text, "last_sync_at" timestamp with time zone, "last_error" text, "created_by" uuid, "created_at" timestamp with time zone, "updated_at" timestamp with time zone);
CREATE TABLE public.dabbir_feedback ("id" uuid, "user_id" uuid, "business_id" uuid, "category" text, "rating" smallint, "message" text, "context" jsonb, "created_at" timestamp with time zone, "status" text, "feature" text, "feedback_type" text, "frequency" integer, "reviewed_at" timestamp with time zone, "resolved_at" timestamp with time zone, "linked_entity_type" text, "linked_entity_id" uuid);
CREATE TABLE public.dabbir_memberships ("business_id" uuid, "user_id" uuid, "role" text, "created_at" timestamp with time zone, "status" text, "permissions" text[], "display_name" text, "invited_by" uuid, "accepted_at" timestamp with time zone, "suspended_at" timestamp with time zone, "removed_at" timestamp with time zone, "updated_at" timestamp with time zone);
CREATE TABLE public.dabbir_platform_admins ("user_id" uuid, "role" text, "active" boolean, "created_at" timestamp with time zone, "permissions" text[], "display_name" text, "added_by" uuid, "updated_at" timestamp with time zone, "suspended_at" timestamp with time zone, "revoked_at" timestamp with time zone, "access_scope" jsonb, "access_expires_at" timestamp with time zone, "mfa_required" boolean, "approval_limit_aed" numeric(14,2), "last_access_reviewed_at" timestamp with time zone, "role_code" text, "granular_permissions" text[]);
CREATE TABLE public.dabbir_platform_owner_audit ("id" uuid, "business_id" uuid, "action" text, "entity_type" text, "entity_id" uuid, "reason" text, "outcome" text, "before_state" jsonb, "after_state" jsonb, "source" text, "created_at" timestamp with time zone, "actor_user_id" uuid, "confirmation" text, "request_id" uuid);
CREATE TABLE public.dabbir_platform_owner_incidents ("id" uuid, "customer_no" text, "business_id" uuid, "category" text, "priority" text, "status" text, "assigned_queue" text, "summary" text, "description" text, "root_cause" text, "resolution" text, "sla_due_at" timestamp with time zone, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "resolved_at" timestamp with time zone, "last_event_at" timestamp with time zone);
CREATE TABLE public.dabbir_stripe_events ("stripe_event_id" text, "event_type" text, "livemode" boolean, "stripe_created_at" timestamp with time zone, "status" text, "error_code" text, "attempt_count" integer, "processed_at" timestamp with time zone, "created_at" timestamp with time zone, "updated_at" timestamp with time zone);
CREATE TABLE public.dabbir_user_accounts ("user_id" uuid, "customer_no" text, "created_at" timestamp with time zone, "display_name" text, "contact_email" text, "contact_phone" text, "updated_at" timestamp with time zone);
CREATE TABLE public.dabbir_whatsapp_connections ("id" uuid, "business_id" uuid, "provider" text, "status" text, "meta_app_id" text, "waba_id" text, "phone_number_id" text, "display_phone_number" text, "verified_name" text, "access_token_ciphertext" text, "access_token_iv" text, "access_token_tag" text, "token_expires_at" timestamp with time zone, "token_key_version" text, "connected_by" uuid, "connected_at" timestamp with time zone, "last_verified_at" timestamp with time zone, "last_provider_status" integer, "last_error" text, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "branch_id" uuid);
CREATE OR REPLACE FUNCTION dabbir_private.platform_admin_is_active(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'dabbir_private'
AS $function$ select exists(select 1 from public.dabbir_platform_admins a where a.user_id=p_user_id and a.active=true and a.revoked_at is null and a.suspended_at is null and (a.access_expires_at is null or a.access_expires_at>now())) $function$;
CREATE OR REPLACE FUNCTION dabbir_private.platform_assert_admin(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dabbir_private'
AS $function$
declare v_role text;
begin
  select role into v_role from public.dabbir_platform_admins where user_id=p_user_id and active=true and revoked_at is null and suspended_at is null;
  if v_role is distinct from 'ROOT_OWNER' then raise exception 'DABBIR_ROOT_OWNER_REQUIRED'; end if;
  return v_role;
end;
$function$;
CREATE OR REPLACE FUNCTION dabbir_private.platform_identity(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dabbir_private'
AS $function$
declare v public.dabbir_platform_admins%rowtype;
begin
  select * into v from public.dabbir_platform_admins where user_id=p_user_id and active=true and revoked_at is null and suspended_at is null limit 1;
  if not found then return jsonb_build_object('active',false); end if;
  return jsonb_build_object('active',true,'user_id',v.user_id,'role',v.role,'root_owner',v.role='ROOT_OWNER','permissions',case when v.role='ROOT_OWNER' then to_jsonb(array[
    'manage_customers','manage_businesses','manage_orders','manage_bookings','manage_products','manage_services','manage_support','manage_incidents','manage_integrations','manage_employees','manage_system','manage_releases','manage_ceo_commands','view_financials','manage_financial_operations'
  ]::text[]) else to_jsonb(v.permissions) end);
end;
$function$;
CREATE OR REPLACE FUNCTION dabbir_private.platform_has_permission(p_user_id uuid, p_permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dabbir_private'
AS $function$
declare v_role text; v_permissions text[];
begin
  if not dabbir_private.platform_permission_allowed(p_permission) then return false; end if;
  select role,permissions into v_role,v_permissions from public.dabbir_platform_admins where user_id=p_user_id and active=true and revoked_at is null and suspended_at is null;
  if not found then return false; end if;
  if v_role='ROOT_OWNER' then return true; end if;
  return v_role='OWNER_DELEGATE' and p_permission=any(coalesce(v_permissions,'{}'::text[]));
end;$function$;
CREATE OR REPLACE FUNCTION dabbir_private.platform_assert_permission(p_user_id uuid, p_permission text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dabbir_private'
AS $function$ begin if not dabbir_private.platform_has_permission(p_user_id,p_permission) then raise exception 'DABBIR_PLATFORM_PERMISSION_REQUIRED:%',p_permission; end if; end $function$;
CREATE OR REPLACE FUNCTION dabbir_private.platform_assert_business_scope(p_user_id uuid, p_business_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'dabbir_private'
AS $function$
begin
  if not dabbir_private.platform_scope_allows_business(p_user_id,p_business_id) then
    raise exception 'DABBIR_BUSINESS_SCOPE_DENIED';
  end if;
end;
$function$;
CREATE OR REPLACE FUNCTION dabbir_private.platform_scope_is_global(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'dabbir_private'
AS $function$
  select exists(
    select 1 from public.dabbir_platform_admins a
    where a.user_id=p_user_id
      and dabbir_private.platform_admin_is_active(p_user_id)
      and (a.role='ROOT_OWNER' or coalesce(a.access_scope->>'type','')='ALL_BUSINESSES')
  )
$function$;
CREATE OR REPLACE FUNCTION dabbir_private.platform_scope_allows_business(p_user_id uuid, p_business_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'dabbir_private'
AS $function$
declare v_scope jsonb; v_type text; v_region text;
begin
  if p_business_id is null then return false; end if;
  select access_scope into v_scope
  from public.dabbir_platform_admins
  where user_id=p_user_id and dabbir_private.platform_admin_is_active(p_user_id);
  if not found then return false; end if;
  v_type:=coalesce(v_scope->>'type','');
  if v_type='ALL_BUSINESSES' then return true; end if;
  if v_type='SPECIFIC_BUSINESS' then
    return nullif(v_scope->>'business_id','')::uuid=p_business_id;
  end if;
  if v_type='ASSIGNED_BUSINESSES_ONLY' then
    return exists(
      select 1 from jsonb_array_elements_text(coalesce(v_scope->'business_ids','[]'::jsonb)) x
      where x::uuid=p_business_id
    );
  end if;
  if v_type='SPECIFIC_REGION' then
    v_region:=upper(coalesce(v_scope->>'region_code',v_scope->>'country_code',''));
    return exists(select 1 from public.dabbir_businesses b where b.id=p_business_id and upper(coalesce(b.country_code,''))=v_region);
  end if;
  return false;
exception when others then return false;
end;
$function$;
create or replace function dabbir_private.platform_effective_capability(p_user_id uuid,p_code text)
returns boolean
language plpgsql
stable
security invoker
set search_path='pg_catalog','public','dabbir_private'
as $$
declare
  v_admin public.dabbir_platform_admins%rowtype;
  v_owner_only boolean;
  v_legacy text;
begin
  select * into v_admin
  from public.dabbir_platform_admins
  where user_id=p_user_id and dabbir_private.platform_admin_is_active(p_user_id);
  if not found then return false; end if;
  if v_admin.role='ROOT_OWNER' then return true; end if;

  select owner_only into v_owner_only
  from dabbir_private.platform_permissions
  where code=p_code;
  if not found or v_owner_only then return false; end if;

  if cardinality(coalesce(v_admin.granular_permissions,'{}'::text[]))>0 then
    return p_code=any(v_admin.granular_permissions);
  end if;

  -- Compatibility path for legacy delegates that predate granular permission snapshots.
  -- Once a delegate has any granular snapshot, this fallback is never consulted.
  v_legacy:=case split_part(p_code,'.',1)
    when 'businesses' then 'manage_businesses'
    when 'customers' then 'manage_customers'
    when 'orders' then 'manage_orders'
    when 'bookings' then 'manage_bookings'
    when 'support' then 'manage_support'
    when 'team' then 'manage_employees'
    when 'tasks' then 'manage_employees'
    when 'system' then 'manage_system'
    when 'security' then 'manage_system'
    when 'audit' then 'manage_system'
    when 'approvals' then 'manage_system'
    when 'incidents' then 'manage_incidents'
    when 'integrations' then 'manage_integrations'
    when 'releases' then 'manage_releases'
    when 'ceo' then 'manage_ceo_commands'
    when 'reports' then case when p_code like 'reports.export%' then 'manage_system' else 'view_financials' end
    when 'payments' then case when p_code='payments.view' then 'view_financials' else 'manage_financial_operations' end
    when 'subscriptions' then case when p_code='subscriptions.view' then 'view_financials' else 'manage_financial_operations' end
    else null
  end;
  return v_legacy is not null and v_legacy=any(coalesce(v_admin.permissions,'{}'::text[]));
end;
$$;

CREATE OR REPLACE FUNCTION dabbir_private.platform_permission_allowed(p_permission text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'dabbir_private'
AS $function$
  select coalesce(p_permission,'')=any(array['manage_customers','manage_businesses','manage_orders','manage_bookings','manage_products','manage_services','manage_support','manage_incidents','manage_integrations','manage_employees','manage_system','manage_releases','manage_ceo_commands','view_financials','manage_financial_operations']::text[])
$function$;
-- Customer support thread schema merged from main on 2026-09-07.
alter table dabbir_private.platform_customer_support_cases add column customer_visible boolean default false,add column public_reference text,add column origin text,add column channel text;
create table dabbir_private.platform_customer_support_messages(id uuid default gen_random_uuid(),case_id uuid,actor_user_id uuid,author_kind text,body text,created_at timestamptz default now());
