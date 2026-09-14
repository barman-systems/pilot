import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const root=new URL('..',import.meta.url);
const workflows=new URL('../.github/workflows/',import.meta.url);
const retired=[
  'dabbir-aws-diagnose.yml','dabbir-aws-infra-ci.yml','dabbir-aws-oidc-smoke.yml',
  'dabbir-aws-s3-permission-hotfix.yml','dabbir-aws-stack-diagnose.yml','dabbir-aws-uae-foundation-bootstrap.yml',
  'dabbir-aws-uae-foundation.yml','dabbir-uae-ec2-check.yml','dabbir-uae-infra.yml','dabbir-uae-deploy-now.yml',
  'dabbir-uae-provision-direct.yml','dabbir-uae-bootstrap-supabase.yml','dabbir-p0a-aws-trust-preflight-once.yml',
  'dabbir-oidc-subject-migrate-once.yml',
];

test('AWS execution authorities are retired and cannot silently return',async()=>{
  const names=new Set(await readdir(workflows));
  for(const name of retired) assert.equal(names.has(name),false,`retired AWS workflow revived: ${name}`);
  assert.equal(names.has('p0a-decommission-aws-oidc.yml'),true);

  for(const name of names){
    if(!name.endsWith('.yml')&&!name.endsWith('.yaml')) continue;
    if(name==='p0a-decommission-aws-oidc.yml') continue;
    const text=await readFile(new URL(name,workflows),'utf8');
    assert.doesNotMatch(text,/arn:aws:iam::388699644093:role\/DabbirGithubDeployRole/u,`${name} revives retired AWS role`);
    assert.doesNotMatch(text,/aws-actions\/configure-aws-credentials/u,`${name} revives AWS credential authority`);
  }
});

test('AWS infrastructure source is explicitly historical, not an active production direction',async()=>{
  const readme=await readFile(new URL('../infra/aws-uae/README.md',import.meta.url),'utf8');
  assert.match(readme,/RETIRED/i);
  assert.match(readme,/Vercel.*Supabase|Supabase.*Vercel/is);
  assert.match(readme,/no active AWS deployment authority/i);
});
