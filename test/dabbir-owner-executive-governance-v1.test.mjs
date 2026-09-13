import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260905195000_dabbir_owner_executive_command_center_v1.sql',import.meta.url),'utf8');
const session=fs.readFileSync(new URL('../supabase/migrations/20260905195500_dabbir_owner_session_scope_expiry_v1.sql',import.meta.url),'utf8');

test('owner governance adds fail-closed delegated access controls',()=>{
  for(const token of ['access_scope','access_expires_at','mfa_required','approval_limit_aed','platform_approval_requests','platform_tasks','platform_access_reviews']) assert.match(migration,new RegExp(token));
  for(const scope of ['ALL_BUSINESSES','ASSIGNED_BUSINESSES_ONLY','SPECIFIC_BUSINESS','SPECIFIC_REGION','OWN_TASKS_ONLY']) assert.match(migration,new RegExp(scope));
});

test('granular permission catalog covers owner command center domains',()=>{
  for(const permission of ['businesses.delete','payments.refund','team.remove','security.manage','audit.view','reports.export','approvals.approve','tasks.assign']) assert.match(migration,new RegExp(permission.replace('.','\\.')));
});

test('temporary access is enforced at session verification',()=>{
  assert.match(session,/access_expires_at is null or access_expires_at>now\(\)/);
  assert.match(session,/update dabbir_private\.owner_sessions set revoked_at=now\(\)/);
  assert.match(session,/'access_scope',v_admin\.access_scope/);
  assert.match(session,/revoke all on function public\.dabbir_owner_session_verify_v1\(text\) from anon, authenticated/);
});
