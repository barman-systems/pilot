import {
  installProtectedFetchAccess,
  installProtectedPlaywrightAccess,
} from './support/dabbir-protected-journey-access.mjs';

const origin = String(process.env.PRODUCTION_ORIGIN || '').trim().replace(/\/$/, '');
const bypass = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();
const trustedOidc = String(process.env.VERCEL_TRUSTED_OIDC_TOKEN || '').trim();

const installed = installProtectedFetchAccess({ origin, bypass, trustedOidc });
const { webkit } = await import('playwright');
installProtectedPlaywrightAccess(webkit, installed.accessHeaders);

console.log(`DABBIR_PROTECTED_FULL_JOURNEY_ACCESS=${bypass ? 'automation_bypass' : 'trusted_oidc'}`);
