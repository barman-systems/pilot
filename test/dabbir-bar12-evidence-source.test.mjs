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
  assert.match(source,/payload\.ref!==GH_REF/);
  assert.match(source,/crypto\.subtle\.verify/);
});

test('BAR-12 evidence returns aggregates and never selects customer content',()=>{
  assert.doesNotMatch(source,/select\(['"`](?:[^'"`]*)(body|email|phone|display_name|access_token_ciphertext)/i);
  assert.match(source,/connection_success_rate:null/);
  assert.match(source,/satisfaction:\{samples:0,score:null\}/);
  assert.match(source,/verified_external_result/);
  assert.match(source,/channel_type','whatsapp'/);
});

test('readiness workflow reuses the existing QA runner with short-lived OIDC',()=>{
  assert.match(workflow,/id-token:\s*write/);
  assert.match(workflow,/audience=dabbir-bar12-readiness/);
  assert.match(workflow,/barman-qa-suite-runner/);
  assert.match(workflow,/dabbir_bar12_readiness/);
  assert.doesNotMatch(workflow,/dabbir-bar12-readiness-evidence/);
  assert.doesNotMatch(workflow,/SUPABASE_SERVICE_ROLE_KEY|VERCEL_TOKEN|META_APP_SECRET/);
});
