import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const CONTRACT_PATH = 'config/barman-integration-contract.json';
const HTTPS_ORIGIN_RE = /^https:\/\/[^/]+$/i;

export function classifyProductionOrigin({ origin = '', contract }) {
  const value = String(origin || '').trim().replace(/\/$/, '');
  const deployment = contract?.deployment || {};
  const launchDomain = String(deployment.public_launch_domain || '').trim().toLowerCase();
  const protectedPrelaunch =
    !launchDomain &&
    deployment.domain_access === 'VERCEL_AUTH_PROTECTED' &&
    deployment.production_runtime_policy === 'FAIL_CLOSED_PREVIEW_ONLY' &&
    deployment.project_live === false;

  if (!value) {
    if (protectedPrelaunch) {
      return {
        ready: false,
        state: 'BLOCKED_PRELAUNCH',
        reason: 'DABBIR intentionally has no public launch domain; production-only journeys must not run against the protected Vercel project URL.',
      };
    }
    throw new Error('DABBIR_PRODUCTION_ORIGIN must be configured as the canonical public HTTPS origin.');
  }

  if (!HTTPS_ORIGIN_RE.test(value)) {
    throw new Error('DABBIR_PRODUCTION_ORIGIN must be configured as the canonical public HTTPS origin.');
  }
  if (!launchDomain) {
    throw new Error('DABBIR_PRODUCTION_ORIGIN is configured before public_launch_domain is approved in the integration contract.');
  }

  const url = new URL(value);
  if (url.hostname.toLowerCase() !== launchDomain || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('DABBIR_PRODUCTION_ORIGIN does not match the approved public_launch_domain.');
  }
  if (deployment.domain_access === 'VERCEL_AUTH_PROTECTED' || deployment.production_runtime_policy === 'FAIL_CLOSED_PREVIEW_ONLY' || deployment.project_live !== true) {
    throw new Error('DABBIR public launch contract is inconsistent: a public origin exists while deployment remains protected or not live.');
  }

  return {
    ready: true,
    state: 'PUBLIC_PRODUCTION_READY',
    origin: value,
    reason: 'Canonical public launch origin matches the approved live deployment contract.',
  };
}

function append(file, text) {
  if (file) fs.appendFileSync(file, text);
}

export function runGate({ origin = process.env.PRODUCTION_ORIGIN, contractPath = CONTRACT_PATH } = {}) {
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  const result = classifyProductionOrigin({ origin, contract });
  append(process.env.GITHUB_OUTPUT, `ready=${result.ready ? 'true' : 'false'}\nstate=${result.state}\n`);
  append(process.env.GITHUB_STEP_SUMMARY, `## DABBIR Production Origin Gate\n\n**State:** ${result.state}\n\n${result.reason}\n`);
  console.log(`${result.state}: ${result.reason}`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runGate();
}
