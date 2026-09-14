import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function canonicalizeForPolicyHash(value) {
  if (Array.isArray(value)) return value.map(canonicalizeForPolicyHash);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, canonicalizeForPolicyHash(value[key])])
    );
  }
  return value;
}

export function computeDataEgressPolicyHash(policy) {
  const canonical = JSON.stringify(canonicalizeForPolicyHash(policy));
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const policyPath = process.argv[2] || 'config/security/data-egress-policy.v1.json';
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  process.stdout.write(`${computeDataEgressPolicyHash(policy)}\n`);
}
