import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  configuredAutomaticRecoveryProviders,
  configuredDiagnosticDirectProviders,
  geminiAutomaticGenerationRecoveryEnabled,
  providerRoutingReadiness,
} from '../api/_ai-provider-readiness.js';

const endpoint = fs.readFileSync(new URL('../api/dabbir-ai.js', import.meta.url), 'utf8');

test('production readiness reports actual automatic recovery authority, not every diagnostic credential', () => {
  const env = {
    VERCEL_ENV: 'production',
    DABBIR_GEMINI_GENERATION_RECOVERY_ENABLED: '0',
    GEMINI_API_KEY: 'secret-gemini',
    GROQ_API_KEY: 'secret-groq',
    CLOUDFLARE_API_TOKEN: 'secret-cf',
    CLOUDFLARE_ACCOUNT_ID: 'acct',
  };

  assert.deepEqual(configuredAutomaticRecoveryProviders(env), ['groq', 'cloudflare-workers-ai']);
  assert.deepEqual(configuredDiagnosticDirectProviders(env), ['google-gemini', 'groq', 'cloudflare-workers-ai']);

  const readiness = providerRoutingReadiness(env);
  assert.equal(readiness.routing_mode, 'GATEWAY_PRIMARY_DIRECT_RECOVERY');
  assert.equal(readiness.gateway_primary_configured, true);
  assert.equal(readiness.automatic_recovery_provider_count, 2);
  assert.deepEqual(readiness.automatic_recovery_providers, ['groq', 'cloudflare-workers-ai']);
  assert.equal(readiness.direct_provider_count, 2);
  assert.deepEqual(readiness.direct_providers, ['groq', 'cloudflare-workers-ai']);
  assert.equal(readiness.diagnostic_direct_provider_count, 3);
  assert.equal(readiness.configured_provider_count, 3);
  assert.equal(readiness.redundancy_ready, true);
});

test('Gateway-primary fails closed for Gemini recovery when the retirement flag is absent', () => {
  const gatewayPrimary = {
    VERCEL_ENV: 'production',
    GEMINI_API_KEY: 'diagnostic-only',
  };
  assert.equal(geminiAutomaticGenerationRecoveryEnabled(gatewayPrimary), false);
  assert.deepEqual(configuredDiagnosticDirectProviders(gatewayPrimary), ['google-gemini']);
  assert.deepEqual(configuredAutomaticRecoveryProviders(gatewayPrimary), []);

  const directOnly = { GEMINI_API_KEY: 'direct-only' };
  assert.equal(geminiAutomaticGenerationRecoveryEnabled(directOnly), true);
  assert.deepEqual(configuredAutomaticRecoveryProviders(directOnly), ['google-gemini']);

  const explicitGatewayOverride = {
    ...gatewayPrimary,
    DABBIR_GEMINI_GENERATION_RECOVERY_ENABLED: '1',
  };
  assert.equal(geminiAutomaticGenerationRecoveryEnabled(explicitGatewayOverride), true);
  assert.deepEqual(configuredAutomaticRecoveryProviders(explicitGatewayOverride), ['google-gemini']);
});

test('Gemini can remain an explicit diagnostic provider without silently rejoining automatic recovery', () => {
  const retired = {
    DABBIR_GEMINI_GENERATION_RECOVERY_ENABLED: '0',
    GEMINI_API_KEY: 'diagnostic-only',
  };
  assert.deepEqual(configuredDiagnosticDirectProviders(retired), ['google-gemini']);
  assert.deepEqual(configuredAutomaticRecoveryProviders(retired), []);

  const explicitlyEnabled = {
    DABBIR_GEMINI_GENERATION_RECOVERY_ENABLED: '1',
    GEMINI_API_KEY: 'explicit-recovery',
  };
  assert.deepEqual(configuredAutomaticRecoveryProviders(explicitlyEnabled), ['google-gemini']);
});

test('AI health is wired to the routing readiness authority and exposes no credential names or values', () => {
  assert.match(endpoint, /providerRoutingReadiness\(\)/);
  assert.doesNotMatch(endpoint, /getDABBIRAiRedundancy/);
  assert.match(endpoint, /automatic_recovery_providers:\s*readiness\.automatic_recovery_providers/);
  assert.match(endpoint, /diagnostic_direct_providers:\s*readiness\.diagnostic_direct_providers/);
  assert.doesNotMatch(endpoint, /GEMINI_API_KEY|GROQ_API_KEY|CLOUDFLARE_API_TOKEN|AI_GATEWAY_API_KEY/);
  assert.doesNotMatch(endpoint, /api_token_value|secret_value|credential_value/i);
});
