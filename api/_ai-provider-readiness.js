export function gatewayPrimaryConfigured(env = process.env) {
  return Boolean(env.VERCEL_ENV || env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN);
}

export function geminiAutomaticGenerationRecoveryEnabled(env = process.env) {
  const explicit = String(env.DABBIR_GEMINI_GENERATION_RECOVERY_ENABLED ?? '').trim();
  if (explicit === '1') return true;
  if (explicit === '0') return false;
  // Gateway-primary deployments fail closed: Gemini does not silently rejoin
  // customer recovery merely because a diagnostic credential exists.
  return !gatewayPrimaryConfigured(env);
}

export function configuredDiagnosticDirectProviders(env = process.env) {
  return [
    env.GEMINI_API_KEY ? 'google-gemini' : null,
    env.GROQ_API_KEY ? 'groq' : null,
    env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID ? 'cloudflare-workers-ai' : null,
  ].filter(Boolean);
}

export function configuredAutomaticRecoveryProviders(env = process.env) {
  return [
    geminiAutomaticGenerationRecoveryEnabled(env) && env.GEMINI_API_KEY ? 'google-gemini' : null,
    env.GROQ_API_KEY ? 'groq' : null,
    env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID ? 'cloudflare-workers-ai' : null,
  ].filter(Boolean);
}

// Backward-compatible name. In runtime readiness, "direct" means an automatic
// customer recovery route, not merely a credential that exists for diagnostics.
export function configuredDirectProviders(env = process.env) {
  return configuredAutomaticRecoveryProviders(env);
}

export function providerRoutingReadiness(env = process.env) {
  const automaticRecoveryProviders = configuredAutomaticRecoveryProviders(env);
  const diagnosticDirectProviders = configuredDiagnosticDirectProviders(env);
  const gatewayConfigured = gatewayPrimaryConfigured(env);
  const configuredProviderCount = automaticRecoveryProviders.length + (gatewayConfigured ? 1 : 0);

  return {
    routing_mode: gatewayConfigured ? 'GATEWAY_PRIMARY_DIRECT_RECOVERY' : 'DIRECT_ONLY',
    gateway_primary_configured: gatewayConfigured,
    gateway_fallback_configured: gatewayConfigured,
    automatic_recovery_providers: automaticRecoveryProviders,
    automatic_recovery_provider_count: automaticRecoveryProviders.length,
    direct_providers: automaticRecoveryProviders,
    direct_provider_count: automaticRecoveryProviders.length,
    diagnostic_direct_providers: diagnosticDirectProviders,
    diagnostic_direct_provider_count: diagnosticDirectProviders.length,
    configured_provider_count: configuredProviderCount,
    redundancy_ready: configuredProviderCount >= 2,
  };
}
