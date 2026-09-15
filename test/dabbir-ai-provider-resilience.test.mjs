import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { providerRoutingReadiness } from '../api/_ai-provider-readiness.js';

const core=fs.readFileSync(new URL('../api/_ai-core.js',import.meta.url),'utf8');
const endpoint=fs.readFileSync(new URL('../api/dabbir-ai.js',import.meta.url),'utf8');

test('Gateway keeps a realistic bounded primary window instead of the old 2.5s cold-start cutoff',()=>{
  assert.match(core,/GATEWAY_TOTAL_TIMEOUT_MS\s*=\s*12000/);
  assert.match(core,/GATEWAY_PRIMARY_TIMEOUT_MS\s*=\s*6000/);
  assert.match(core,/Date\.now\(\) \+ GATEWAY_TOTAL_TIMEOUT_MS/);
  assert.match(core,/Math\.min\(GATEWAY_PRIMARY_TIMEOUT_MS, remaining\)/);
  assert.doesNotMatch(core,/Date\.now\(\) \+ 5000/);
  assert.doesNotMatch(core,/Math\.min\(2500, remaining\)/);
});

test('provider recovery readiness counts only eligible automatic paths and never returns credential values',()=>{
  const ready=providerRoutingReadiness({
    DABBIR_GEMINI_GENERATION_RECOVERY_ENABLED:'0',
    GEMINI_API_KEY:'secret-gemini',
    GROQ_API_KEY:'secret-groq',
    CLOUDFLARE_API_TOKEN:'secret-cf',
    CLOUDFLARE_ACCOUNT_ID:'acct',
    VERCEL_ENV:'production',
  });
  assert.equal(ready.direct_provider_count,2);
  assert.deepEqual(ready.direct_providers,['groq','cloudflare-workers-ai']);
  assert.equal(ready.automatic_recovery_provider_count,2);
  assert.equal(ready.diagnostic_direct_provider_count,3);
  assert.equal(ready.gateway_primary_configured,true);
  assert.equal(ready.gateway_fallback_configured,true);
  assert.equal(ready.routing_mode,'GATEWAY_PRIMARY_DIRECT_RECOVERY');
  assert.equal(ready.configured_provider_count,3);
  assert.equal(ready.redundancy_ready,true);
  assert.doesNotMatch(JSON.stringify(ready),/secret-gemini|secret-groq|secret-cf|acct/);

  const diagnosticOnly=providerRoutingReadiness({
    DABBIR_GEMINI_GENERATION_RECOVERY_ENABLED:'0',
    GEMINI_API_KEY:'secret',
  });
  assert.equal(diagnosticOnly.configured_provider_count,0);
  assert.equal(diagnosticOnly.diagnostic_direct_provider_count,1);
  assert.equal(diagnosticOnly.gateway_primary_configured,false);
  assert.equal(diagnosticOnly.routing_mode,'DIRECT_ONLY');
  assert.equal(diagnosticOnly.redundancy_ready,false);
});

test('public AI readiness uses the routing readiness authority without provider credentials',()=>{
  assert.match(endpoint,/providerRoutingReadiness/);
  assert.doesNotMatch(endpoint,/getDABBIRAiRedundancy/);
  assert.match(endpoint,/configured_provider_count/);
  assert.match(endpoint,/direct_provider_count/);
  assert.match(endpoint,/automatic_recovery_provider_count/);
  assert.match(endpoint,/diagnostic_direct_provider_count/);
  assert.match(endpoint,/gateway_primary_configured/);
  assert.match(endpoint,/gateway_fallback_configured/);
  assert.match(endpoint,/routing_mode/);
  assert.match(endpoint,/redundancy_ready/);
  assert.doesNotMatch(endpoint,/GEMINI_API_KEY|GROQ_API_KEY|CLOUDFLARE_API_TOKEN|AI_GATEWAY_API_KEY/);
});
