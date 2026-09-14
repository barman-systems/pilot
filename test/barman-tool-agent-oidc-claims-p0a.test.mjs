import test from 'node:test';
import assert from 'node:assert/strict';
import { validateToolAgentClaims } from '../api/barman-tool-agent-broker.js';

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

test('P0-A records environment and replay binding as pre-activation requirements, not live authority',()=>{
  // The persistent tool-agent workflow is intentionally disabled and has no id-token: write permission.
  // Environment binding and durable one-time replay consumption must be added before any future activation.
  // This test deliberately does not pretend those controls exist today.
  assert.equal(validateToolAgentClaims({...baseClaims,environment:'unexpected'},1000),true);
});
