import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const FORBIDDEN_JSON_KEYS = new Set([
  'password',
  'password_hash',
  'mfa_secret',
  'totp_secret',
  'access_token',
  'refresh_token',
  'resend_key',
  'service_role',
  'service_role_key',
  'secret_key',
  'api_key',
  'authorization',
  'cookie',
  'session_token',
  'private_key',
]);

const RAW_DETECTORS = [
  ['github_token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ['openai_key', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/],
  ['anthropic_key', /\bsk-ant-[A-Za-z0-9_-]{20,}\b/],
  ['groq_key', /\bgsk_[A-Za-z0-9_-]{20,}\b/],
  ['stripe_live_key', /\bsk_live_[A-Za-z0-9_-]{16,}\b/],
  ['supabase_secret_key', /\bsb_secret_[A-Za-z0-9._-]{20,}\b/],
  ['google_api_key', /\bAIza[0-9A-Za-z_-]{30,}\b/],
  ['google_oauth_client_secret', /\bGOCSPX-[0-9A-Za-z_-]{20,}\b/],
  ['slack_token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ['aws_access_key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['sendgrid_key', /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{20,}\b/],
  ['private_key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  ['postgres_uri_with_password', /\bpostgres(?:ql)?:\/\/[^\s/@:]+:[^\s/@]+@[^\s/]+/i],
  ['otp_uri', /\botpauth:\/\//i],
  ['qa_password', /\bDabbir-QA-[A-Za-z0-9_!@#$%^&*+=.-]{8,}\b/],
  ['bearer_credential', /\bBearer\s+[A-Za-z0-9._~+\/-]{20,}\b/i],
];

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function walkJson(value, file, findings, pointer = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkJson(item, file, findings, `${pointer}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const normalized = normalizeKey(key);
    if (FORBIDDEN_JSON_KEYS.has(normalized)) {
      findings.push({ detector: `forbidden_json_key:${normalized}`, path: file, location: `${pointer}.${key}` });
    }
    walkJson(child, file, findings, `${pointer}.${key}`);
  }
}

async function collect(target, files, findings) {
  let stat;
  try {
    stat = await fs.lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      findings.push({ detector: 'missing_path', path: target });
      return;
    }
    throw error;
  }
  if (stat.isSymbolicLink()) {
    findings.push({ detector: 'symlink_not_allowed', path: target });
    return;
  }
  if (stat.isDirectory()) {
    const entries = await fs.readdir(target);
    for (const entry of entries.sort()) await collect(path.join(target, entry), files, findings);
    return;
  }
  if (stat.isFile()) files.push(target);
}

export async function scanEvidencePaths(targets) {
  const files = [];
  const findings = [];
  for (const target of targets) await collect(target, files, findings);

  for (const file of files) {
    const body = await fs.readFile(file);
    const raw = body.toString('latin1');
    for (const [detector, pattern] of RAW_DETECTORS) {
      if (pattern.test(raw)) findings.push({ detector, path: file });
    }

    if (path.extname(file).toLowerCase() === '.json') {
      try {
        const parsed = JSON.parse(body.toString('utf8'));
        walkJson(parsed, file, findings);
      } catch {
        findings.push({ detector: 'invalid_json', path: file });
      }
    }
  }

  const unique = [...new Map(findings.map(item => [`${item.detector}\u0000${item.path}\u0000${item.location || ''}`, item])).values()]
    .sort((a, b) => a.path.localeCompare(b.path) || a.detector.localeCompare(b.detector) || String(a.location || '').localeCompare(String(b.location || '')));
  return { scanned_files: files.length, finding_count: unique.length, findings: unique };
}

async function main() {
  const targets = process.argv.slice(2);
  if (!targets.length) {
    console.error('DABBIR_EVIDENCE_SECRET_GATE_FAILED reason=no_paths');
    process.exitCode = 2;
    return;
  }
  const result = await scanEvidencePaths(targets);
  if (result.finding_count) {
    console.error(`DABBIR_EVIDENCE_SECRET_GATE_FAILED findings=${result.finding_count} scanned_files=${result.scanned_files}`);
    for (const finding of result.findings) {
      console.error(`- detector=${finding.detector} path=${finding.path}${finding.location ? ` location=${finding.location}` : ''}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`DABBIR_EVIDENCE_SECRET_GATE_PASS scanned_files=${result.scanned_files}`);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) await main();
