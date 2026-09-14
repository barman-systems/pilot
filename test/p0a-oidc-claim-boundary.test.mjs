import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateToolAgentClaims } from '../api/barman-tool-agent-broker.js';
import { validateIndependentVerifierClaims } from '../api/barman-independent-verifier.js';

const now=1_000_000;
const common={
  iss:'https://token.actions.githubusercontent.com',
  repository:'barman-systems/pilot',
  ref:'refs/heads/main',
  event_name:'push',
  exp:now+300,
  nbf:now-30,
};

function assertNegativeMatrix(validate,claims){
  assert.equal(validate(claims,now),true);
  const mutations=[
    ['iss','https://example.invalid'],
    ['aud','wrong-audience'],
    ['repository','other/repo'],
    ['ref','refs/heads/dev'],
    ['workflow_ref','barman-systems/pilot/.github/workflows/evil.yml@refs/heads/main'],
    ['event_name','pull_request'],
    ['exp',now-10],
    ['nbf',now+31],
  ];
  for(const [key,value] of mutations){
    assert.equal(validate({...claims,[key]:value},now),false,`must reject invalid ${key}`);
  }
}

test('tool-agent GitHub OIDC rejects every material source-claim mutation',()=>{
  assertNegativeMatrix(validateToolAgentClaims,{
    ...common,
    aud:'barman-executive-tool-agent',
    workflow_ref:'barman-systems/pilot/.github/workflows/barman-tool-agent.yml@refs/heads/main',
  });
});

test('independent verifier GitHub OIDC rejects every material source-claim mutation',()=>{
  assertNegativeMatrix(validateIndependentVerifierClaims,{
    ...common,
    aud:'barman-executive-independent-verifier',
    workflow_ref:'barman-systems/pilot/.github/workflows/barman-independent-verifier.yml@refs/heads/main',
  });
});

const denoSurfaces=[
  'supabase/functions/dabbir-qa-suite-runner/index.ts',
  'supabase/functions/barman-qa-suite-runner/index.ts',
  'supabase/functions/dabbir-golden-canary-qa/index.ts',
];

test('GitHub-OIDC Supabase QA surfaces verify signature, time, repo, main ref, workflow and event',()=>{
  for(const path of denoSurfaces){
    const source=fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
    for(const invariant of [
      "https://token.actions.githubusercontent.com",
      "RS256",
      ".well-known/jwks",
      "payload.exp",
      "payload.nbf",
      "payload.repository",
      "payload.ref",
      "payload.workflow_ref",
      "payload.event_name",
      "barman-systems/pilot",
      "refs/heads/main",
    ]) assert.ok(source.includes(invariant),`${path} missing ${invariant}`);
  }
});

test('AWS GitHub OIDC trust is audience-bound and production-environment subject-bound',()=>{
  const source=fs.readFileSync(new URL('../infra/aws-uae/github-oidc-bootstrap.yml',import.meta.url),'utf8');
  assert.match(source,/Url:\s*https:\/\/token\.actions\.githubusercontent\.com/);
  assert.match(source,/sts\.amazonaws\.com/);
  assert.match(source,/token\.actions\.githubusercontent\.com:aud/);
  assert.match(source,/token\.actions\.githubusercontent\.com:sub/);
  assert.match(source,/environment:production/);
  assert.doesNotMatch(source,/\*environment:production/);
});
