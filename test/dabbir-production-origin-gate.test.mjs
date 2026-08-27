import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyProductionOrigin } from '../scripts/dabbir-production-origin-gate.mjs';

function contract(overrides={}) {
  return {
    deployment: {
      public_launch_domain: null,
      domain_access: 'VERCEL_AUTH_PROTECTED',
      production_runtime_policy: 'FAIL_CLOSED_PREVIEW_ONLY',
      project_live: false,
      ...overrides,
    },
  };
}

test('protected DABBIR prelaunch is BLOCKED_PRELAUNCH rather than a false production failure', () => {
  const result=classifyProductionOrigin({origin:'',contract:contract()});
  assert.equal(result.ready,false);
  assert.equal(result.state,'BLOCKED_PRELAUNCH');
  assert.match(result.reason,/no public launch domain/i);
});

test('missing production origin fails once the contract says DABBIR is no longer protected prelaunch', () => {
  assert.throws(
    ()=>classifyProductionOrigin({origin:'',contract:contract({public_launch_domain:'dabbir.example',domain_access:'PUBLIC',production_runtime_policy:'LIVE',project_live:true})}),
    /DABBIR_PRODUCTION_ORIGIN must be configured/
  );
});

test('an origin cannot be configured before a public launch domain is approved', () => {
  assert.throws(
    ()=>classifyProductionOrigin({origin:'https://dabbir-nd56cm4j5v-3619s-projects.vercel.app',contract:contract()}),
    /before public_launch_domain is approved/
  );
});

test('public production requires exact approved hostname and a live unprotected contract', () => {
  const live=contract({public_launch_domain:'dabbir.example',domain_access:'PUBLIC',production_runtime_policy:'LIVE',project_live:true});
  assert.throws(()=>classifyProductionOrigin({origin:'https://other.example',contract:live}),/does not match/);
  const result=classifyProductionOrigin({origin:'https://dabbir.example',contract:live});
  assert.equal(result.ready,true);
  assert.equal(result.state,'PUBLIC_PRODUCTION_READY');
  assert.equal(result.origin,'https://dabbir.example');
});

test('public origin cannot coexist with Vercel-auth-protected or not-live deployment state', () => {
  assert.throws(
    ()=>classifyProductionOrigin({origin:'https://dabbir.example',contract:contract({public_launch_domain:'dabbir.example'})}),
    /inconsistent/
  );
});
