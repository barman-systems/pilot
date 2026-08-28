import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const edge=await readFile(new URL('../supabase/functions/dabbir-protected-browser-qa/index.ts',import.meta.url),'utf8');
const migration=await readFile(new URL('../supabase/migrations/20260828013400_dabbir_protected_qa_share_vault.sql',import.meta.url),'utf8');
const workflow=await readFile(new URL('../.github/workflows/dabbir-protected-live-smoke.yml',import.meta.url),'utf8');

test('protected browser bridge is GitHub OIDC bound to the exact main workflow',()=>{
  assert.match(edge,/GH_AUDIENCE='dabbir-protected-browser-qa'/);
  assert.match(edge,/GH_REPOSITORY='barman-systems\/pilot'/);
  assert.match(edge,/GH_REF='refs\/heads\/main'/);
  assert.match(edge,/dabbir-protected-live-smoke\.yml@refs\/heads\/main/);
  assert.match(edge,/crypto\.subtle\.verify/);
  assert.match(edge,/OIDC_SIGNATURE_INVALID/);
});

test('one-time Vercel share is restricted, consumed server-side, and not returned',()=>{
  assert.match(edge,/dabbir_qa_consume_protected_share/);
  assert.match(edge,/ALLOWED_HOST='dabbir-nd56cm4j5v-3619s-projects\.vercel\.app'/);
  assert.match(edge,/_vercel_share/);
  assert.match(edge,/SHARE_URL_TARGET_DENIED/);
  assert.match(edge,/GITHUB_OIDC_ONE_TIME_VERCEL_SHARE_BROWSER_BRIDGE/);
  assert.doesNotMatch(edge,/safe=\{[^}]*target:/s);
});

test('Vault consumer is service-role only, expiring and destructive-on-read',()=>{
  assert.match(migration,/security definer/i);
  assert.match(migration,/v_created_at < now\(\) - interval '2 hours'/i);
  assert.match(migration,/delete from vault\.secrets where id = v_id/i);
  assert.match(migration,/revoke all on function public\.dabbir_qa_consume_protected_share\(\) from anon/i);
  assert.match(migration,/revoke all on function public\.dabbir_qa_consume_protected_share\(\) from authenticated/i);
  assert.match(migration,/grant execute on function public\.dabbir_qa_consume_protected_share\(\) to service_role/i);
});

test('protected smoke falls back to the OIDC Vault browser bridge without committing access secrets',()=>{
  assert.match(workflow,/bridge_required=true/);
  assert.match(workflow,/audience=dabbir-protected-browser-qa/);
  assert.match(workflow,/functions\/v1\/dabbir-protected-browser-qa/);
  assert.match(workflow,/one_time_vault_browser_bridge/);
  assert.match(workflow,/jq -e '\.ok == true and \.pass == true'/);
  assert.doesNotMatch(workflow,/_vercel_share=[A-Za-z0-9]/);
});
