import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const source=await readFile(new URL('supabase/functions/barman-qa-suite-runner/index.ts',root),'utf8');
const workflow=await readFile(new URL('.github/workflows/dabbir-bar12-readiness.yml',root),'utf8');

test('BAR-12 evidence action has an OIDC profile separate from AI journey actions',()=>{
  assert.match(source,/READINESS_ACTION='dabbir_bar12_readiness'/);
  assert.match(source,/ai:\{audience:'dabbir-ai-qa'/);
  assert.match(source,/readiness:\{audience:'dabbir-bar12-readiness'/);
  assert.match(source,/dabbir-ai-customer-journey\.yml@refs\/heads\/main/);
  assert.match(source,/dabbir-bar12-readiness\.yml@refs\/heads\/main/);
  assert.match(source,/verifyGitHubOidc\(req,'ai'\)/);
  assert.match(source,/verifyGitHubOidc\(req,'readiness'\)/);
  assert.match(source,/if\(action===READINESS_ACTION\)\{try\{return await handleReadiness\(req\)\}/);
  assert.match(source,/if\(!\(await auth\(req\)\)\)return new Response\('unauthorized'/);
  assert.match(source,/payload\.ref!==GH_REF/);
  assert.match(source,/crypto\.subtle\.verify/);
  assert.match(source,/actionError\(e,500\)/);
});

test('BAR-12 evidence is aggregate-only and readiness path is read-only',()=>{
  const readiness=source.slice(source.indexOf('async function exactCount'),source.indexOf('async function handleReadiness'));
  assert.ok(readiness.length>1000);
  assert.doesNotMatch(readiness,/\.insert\(|\.update\(|\.upsert\(|\.delete\(|db\.rpc\(/);
  assert.doesNotMatch(readiness,/select\(['"`](?:[^'"`]*)(body|email|phone|display_name|access_token_ciphertext)/i);
  assert.match(readiness,/connection_success_rate:null/);
  assert.match(readiness,/satisfaction:\{samples:0,score:null\}/);
  assert.match(readiness,/verified_external_result/);
  assert.match(readiness,/channel_type','whatsapp'/);
});

test('readiness workflow reuses the existing QA runner with short-lived OIDC',()=>{
  assert.match(workflow,/id-token:\s*write/);
  assert.match(workflow,/audience=dabbir-bar12-readiness/);
  assert.match(workflow,/supabase\/functions\/barman-qa-suite-runner/);
  assert.match(workflow,/functions\/v1\/barman-qa-suite-runner/);
  assert.match(workflow,/dabbir_bar12_readiness/);
  assert.doesNotMatch(workflow,/dabbir-bar12-readiness-evidence/);
  assert.doesNotMatch(workflow,/SUPABASE_SERVICE_ROLE_KEY|VERCEL_TOKEN|META_APP_SECRET/);
});
