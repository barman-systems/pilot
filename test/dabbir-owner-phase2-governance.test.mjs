import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const scope=read('supabase/migrations/20260905200500_dabbir_owner_scope_enforcement_v2.sql');
const guard=read('supabase/migrations/20260905201000_dabbir_owner_scope_entrypoint_guard_v2.sql');
const team=read('supabase/migrations/20260905202000_dabbir_owner_team_governance_v2.sql');
const session=read('supabase/migrations/20260905203000_dabbir_owner_session_granular_authority_v2.sql');
const broker=read('supabase/functions/dabbir-owner-broker/index.ts');

test('business scope is fail-closed at database entrypoints',()=>{
  for(const token of ['SPECIFIC_BUSINESS','ASSIGNED_BUSINESSES_ONLY','SPECIFIC_REGION','OWN_TASKS_ONLY','DABBIR_BUSINESS_SCOPE_REQUIRED']) assert.match(scope,new RegExp(token));
  assert.match(guard,/dabbir_platform_operational_entities_v1[\s\S]*platform_assert_business_scope/);
  assert.match(guard,/dabbir_platform_operational_action_v2[\s\S]*platform_assert_business_scope/);
  assert.match(guard,/dabbir_platform_customer_search_v2[\s\S]*customer_search_scoped_v3/);
  assert.match(scope,/customer_360_scoped_v2/);
});

test('governed staff model separates authority from operational role',()=>{
  assert.match(team,/role_code text not null default 'CUSTOM'/);
  assert.match(team,/ROOT_OWNER\/OWNER_DELEGATE/);
  assert.match(team,/DABBIR_ROOT_OWNER_PROTECTED/);
  assert.match(team,/DABBIR_SELF_PRIVILEGE_CHANGE_FORBIDDEN/);
  assert.match(team,/update dabbir_private\.owner_sessions set revoked_at=now\(\)/);
  assert.match(team,/DABBIR-DESTRUCTIVE-MIGRATION-REVIEWED:/);
});

test('session returns granular authority and access policy',()=>{
  for(const token of ['role_code','granular_permissions','access_scope','access_expires_at','mfa_required','approval_limit_aed']) assert.match(session,new RegExp(token));
  assert.match(session,/revoke all on function public\.dabbir_owner_session_verify_v1\(text\) from public,anon,authenticated/);
});

test('owner broker enforces granular capabilities and governed team operations',()=>{
  assert.match(broker,/const requireCapability=/);
  assert.match(broker,/dabbir_platform_staff_invite_create_v2/);
  assert.match(broker,/dabbir_platform_staff_governance_update_v2/);
  assert.match(broker,/dabbir_platform_customer_360_scoped_v2/);
  assert.match(broker,/MFA_REQUIRED_NOT_CONFIGURED/);
  assert.match(broker,/dabbir_owner_session_revoke_v1/);
  assert.match(broker,/if\(op==='remove'\)\{const denied=requireRoot\(session\)/);
});

test('broker preserves robust owner email delivery behavior',()=>{
  assert.match(broker,/DABBIR_RESEND_FROM/);
  assert.match(broker,/\/domains/);
  assert.match(broker,/verified_domain_retry/);
  assert.match(broker,/DABBIR_OWNER_EMAIL_DELIVERY_FAILED/);
});
