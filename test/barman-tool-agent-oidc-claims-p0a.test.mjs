import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateToolAgentClaims } from '../api/barman-tool-agent-broker.js';

const workflow=fs.readFileSync(new URL('../.github/workflows/barman-tool-agent.yml',import.meta.url),'utf8');
const baseClaims={
  iss:'https://token.actions.githubusercontent.com',
  aud:'barman-executive-tool-agent',
  repository:'barman-systems/pilot',
  ref:'refs/heads/main',
  workflow_ref:'barman-systems/pilot/.github/workflows/barman-tool-agent.yml@refs/heads/main',
  event_name:'schedule',
  exp:2000,
  nbf:900,
};

test('P0-A OIDC claim predicate rejects alternate issuer, repository, expired, and not-yet-valid tokens',()=>{
  assert.equal(validateToolAgentClaims(baseClaims,1000),true);
  assert.equal(validateToolAgentClaims({...baseClaims,iss:'https://example.invalid'},1000),false);
  assert.equal(validateToolAgentClaims({...baseClaims,repository:'barman-systems/barman-control-plane'},1000),false);
  assert.equal(validateToolAgentClaims({...baseClaims,exp:994},1000),false);
  assert.equal(validateToolAgentClaims({...baseClaims,nbf:1031},1000),false);
});

test('P0-A keeps persistent tool-agent authority disabled until pre-activation claim hardening is complete',()=>{
  assert.match(workflow,/if:\s*\$\{\{\s*false\s*\}\}/);
  assert.doesNotMatch(workflow,/id-token:\s*write/);
});
