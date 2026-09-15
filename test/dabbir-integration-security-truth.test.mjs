import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composioReadinessEnabled } from '../api/dabbir-composio-readiness-cron.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('server-only RLS tables are explicitly denied to client roles',()=>{
  const sql=read('supabase/migrations/20260909054557_explicit_deny_no_policy_tables_v1.sql');
  assert.match(sql,/n\.nspname in \('public','dabbir_private'\)/i);
  assert.match(sql,/revoke all on table %I\.%I from anon, authenticated/i);
  assert.match(sql,/create policy dabbir_explicit_deny_client_v1/i);
  assert.match(sql,/as restrictive for all to anon, authenticated using \(false\) with check \(false\)/i);
  assert.doesNotMatch(sql,/from anon, authenticated, service_role/i);
});

test('advisor baseline records only reviewed current security exceptions and keeps them regression-gated',()=>{
  const baseline=JSON.parse(read('config/supabase-advisor-baseline.json'));
  assert.equal(baseline.project_ref,'fphpoysqdsceniwduxjq');
  assert.equal(baseline.security.rls_enabled_no_policy.count,1);
  assert.deepEqual(baseline.security.rls_enabled_no_policy.objects,['public.dabbir_posthog_product_event_outbox_v1']);
  assert.ok(baseline.policy.monitored_info_lints.includes('rls_enabled_no_policy'));
  assert.ok(baseline.policy.monitored_info_lints.includes('unindexed_foreign_keys'));
  assert.equal(baseline.security.authenticated_security_definer_function_executable.count,9);
  assert.deepEqual(baseline.security.authenticated_security_definer_function_executable.objects,[
    'public.dabbir_activate_owner_policy',
    'public.dabbir_activity_profile_v1',
    'public.dabbir_activity_service_configure_v1',
    'public.dabbir_knowledge_propose_v2',
    'public.dabbir_knowledge_review_v2',
    'public.dabbir_owner_activity_booking_v1',
    'public.dabbir_owner_booking_locations_v1',
    'public.dabbir_owner_policy_candidates',
    'public.dabbir_set_owner_policy_state',
  ]);
});

test('disabled Composio readiness never becomes a scheduled production poll',()=>{
  assert.equal(composioReadinessEnabled({}),false);
  assert.equal(composioReadinessEnabled({DABBIR_COMPOSIO_ENABLED:'false'}),false);
  assert.equal(composioReadinessEnabled({DABBIR_COMPOSIO_ENABLED:'true'}),true);
  const config=JSON.parse(read('vercel.json'));
  assert.equal(config.crons.some(item=>item.path==='/api/dabbir-composio-readiness-cron'),false);
  assert.ok(config.functions['api/dabbir-composio-readiness-cron.js']);
  const source=read('api/dabbir-composio-readiness-cron.js');
  const gate=source.indexOf('if(!composioReadinessEnabled())');
  const provider=source.indexOf('const result=await verifyGoogleSheetsReadOnlySession()');
  assert.ok(gate>=0&&provider>gate,'provider readiness call must remain behind explicit enable gate');
});

test('expected owner scope rejections are not emitted as runtime failures',()=>{
  const source=read('api/owner-action-center.js');
  assert.match(source,/\[400,401,403,404,409\]\.includes\(safe\)/);
  assert.match(source,/dabbir_owner_action_center_rejected/);
  assert.match(source,/safe===429/);
  assert.match(source,/dabbir_owner_action_center_rate_limited/);
  assert.match(source,/dabbir_owner_action_center_failed/);
});
