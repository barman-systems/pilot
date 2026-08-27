import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const source=await readFile(new URL('supabase/functions/dabbir-bar12-readiness-evidence/index.ts',root),'utf8');
const workflow=await readFile(new URL('.github/workflows/dabbir-bar12-readiness.yml',root),'utf8');

test('BAR-12 evidence source is restricted to exact main readiness workflow OIDC',()=>{
  assert.match(source,/GH_AUDIENCE='dabbir-bar12-readiness'/);
  assert.match(source,/GH_REPOSITORY='barman-systems\/pilot'/);
  assert.match(source,/GH_REF='refs\/heads\/main'/);
  assert.match(source,/dabbir-bar12-readiness\.yml@refs\/heads\/main/);
  assert.match(source,/crypto\.subtle\.verify/);
  assert.match(source,/OIDC_SIGNATURE_INVALID/);
  assert.match(source,/OIDC_WORKFLOW_DENIED/);
});

test('BAR-12 evidence source returns aggregates and does not select customer content',()=>{
  assert.doesNotMatch(source,/select\(['"`](?:[^'"`]*)(body|email|phone|display_name|access_token_ciphertext)/i);
  assert.match(source,/connection_success_rate:null/);
  assert.match(source,/satisfaction:\{samples:0,score:null\}/);
  assert.match(source,/verified_external_result/);
  assert.match(source,/channel_type','whatsapp'/);
});

test('readiness workflow uses short-lived OIDC and public launch enforcement',()=>{
  assert.match(workflow,/id-token:\s*write/);
  assert.match(workflow,/audience=dabbir-bar12-readiness/);
  assert.match(workflow,/dabbir-bar12-readiness-evidence/);
  assert.match(workflow,/DABBIR_READINESS_ENFORCE_PUBLIC_ONLY:\s*'true'/);
  assert.doesNotMatch(workflow,/SUPABASE_SERVICE_ROLE_KEY|VERCEL_TOKEN|META_APP_SECRET/);
});
