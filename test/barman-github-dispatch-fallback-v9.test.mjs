import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260903214000_barman_github_dispatch_fallback_v9.sql',import.meta.url),'utf8');

test('scheduler never exposes the GitHub wake credential',()=>{
  assert.match(sql,/barman_github_actions_token/);
  assert.match(sql,/vault\.decrypted_secrets/);
  assert.match(sql,/CREDENTIAL_MISSING/);
  assert.doesNotMatch(sql,/return\s+v_token/i);
  assert.doesNotMatch(sql,/'(?:token|credential|secret)'\s*,\s*v_token/i);
  assert.doesNotMatch(sql,/raise\s+(?:notice|warning|exception)[^;]*v_token/i);
  assert.match(sql,/'Authorization','Bearer '\|\|v_token/);
});

test('scheduler dispatches only canonical BARMAN workflows on main',()=>{
  assert.match(sql,/barman-tool-agent\.yml\/dispatches/);
  assert.match(sql,/barman-independent-verifier\.yml\/dispatches/);
  assert.match(sql,/jsonb_build_object\('ref','main'\)/);
  assert.match(sql,/X-GitHub-Api-Version/);
  assert.match(sql,/BARMAN-Executive-OS/);
});

test('scheduler is bounded, idempotent and service-role only',()=>{
  assert.match(sql,/last_attempt_at/);
  assert.match(sql,/interval '4 minutes'/);
  assert.match(sql,/on conflict \(scheduler_key\) do update/i);
  assert.match(sql,/revoke all on function public\.barman_github_dispatch_tick_v1\(\) from public, anon, authenticated/i);
  assert.match(sql,/grant execute on function public\.barman_github_dispatch_tick_v1\(\) to service_role/i);
  assert.match(sql,/cron\.schedule\(\s*'barman-github-dispatch-fallback'/s);
});

test('missing credential is visible as a real integration failure instead of fake readiness',()=>{
  assert.match(sql,/github_actions_dispatch_fallback/);
  assert.match(sql,/'MISSING'/);
  assert.match(sql,/required_permission','Actions: write'/);
  assert.match(sql,/status=case when nullif\(v_token,''\) is null then 'MISSING' else 'PARTIAL' end/);
});
