-- Real PostgreSQL verification. One transaction, always rolled back.
-- Creates only a temporary support case/note/audit; no external send, customer change or session change.
begin;
set local statement_timeout='15s';
set local lock_timeout='2s';
do $verification$
declare
 actor uuid;
 customer record;
 receipt jsonb;
 v_qa_case_id uuid;
begin
 select user_id into actor from public.dabbir_platform_admins
 where role='ROOT_OWNER' and dabbir_private.platform_admin_is_active(user_id) limit 1;
 if actor is null then raise exception 'QA_ROOT_PREREQUISITE_MISSING'; end if;
 select ua.user_id,ua.customer_no,m.business_id into customer
 from public.dabbir_user_accounts ua join public.dabbir_memberships m on m.user_id=ua.user_id
 where m.status='active' and ua.customer_no ~ '^DAB-[0-9]{6,}$' order by ua.created_at limit 1;
 if not found then raise exception 'QA_CUSTOMER_PREREQUISITE_MISSING'; end if;
 receipt:=public.dabbir_platform_support_action_v2(actor,'CREATE',null,customer.user_id,customer.customer_no,customer.business_id,'general','normal','Owner consolidation transaction QA','Rollback-only persistence verification');
 v_qa_case_id:=(receipt->>'case_id')::uuid;
 if receipt->>'result'<>'SUCCESS' or v_qa_case_id is null then raise exception 'QA_SUPPORT_RECEIPT_FAILED'; end if;
 if not exists(select 1 from dabbir_private.platform_customer_support_notes n where n.case_id=v_qa_case_id and n.note='Rollback-only persistence verification') then raise exception 'QA_NOTE_NOT_PERSISTED'; end if;
 if not exists(select 1 from dabbir_private.platform_staff_audit a where a.action='SUPPORT_CREATE' and a.metadata->>'case_id'=v_qa_case_id::text) then raise exception 'QA_AUDIT_NOT_PERSISTED'; end if;
 perform public.dabbir_platform_support_action_v2(actor,'UPDATE',v_qa_case_id,null,null,null,null,null,null,null,'resolved');
 perform public.dabbir_platform_support_action_v2(actor,'UPDATE',v_qa_case_id,null,null,null,null,null,null,null,'open');
 if not exists(select 1 from dabbir_private.platform_customer_support_cases c where c.id=v_qa_case_id and c.status='open' and c.resolved_at is null) then raise exception 'QA_REOPEN_FAILED'; end if;
 perform public.dabbir_platform_audit_list_v1(actor,100);
 perform public.dabbir_platform_command_center_overview_v1(actor);
end;
$verification$;
rollback;
select count(*)=0 as rollback_left_no_test_cases
from dabbir_private.platform_customer_support_cases where subject='Owner consolidation transaction QA';
