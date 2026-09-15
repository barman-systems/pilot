import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const HIGH_RISK_NAMES = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_URL',
  'DATABASE_URL',
  'VERCEL_TOKEN',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GROQ_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'DABBIR_WHATSAPP_APP_SECRET',
  'PILOT_WHATSAPP_APP_SECRET',
  'DABBIR_META_APP_SECRET',
  'DABBIR_GOOGLE_CALENDAR_CLIENT_SECRET',
  'DABBIR_CALENDAR_TOKEN_KEY',
  'DABBIR_CALENDAR_STATE_SECRET',
  'DABBIR_TIKTOK_APP_SECRET',
  'TIKTOK_APP_SECRET',
  'CRON_SECRET',
  'SENTRY_AUTH_TOKEN',
  'STRIPE_SECRET_KEY',
  'POSTHOG_PERSONAL_API_KEY',
  'CLOUDFLARE_API_TOKEN',
];

const DIRECT_PATTERNS = [
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
];

const PLACEHOLDER = /(?:\$\{|\$\(|\$[A-Z_]|secrets\.|process\.env|Deno\.env|env\.|github\.|example(?:\.|_|-)|localhost|127\.0\.0\.1|redacted|placeholder|changeme|your[_-]|dummy|fake|test[_-]?secret|<[^>]+>|\*\*\*)/i;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function serviceRoleJwtPresent(line) {
  for (const token of line.match(JWT) || []) {
    try {
      const payload = JSON.parse(decodeBase64Url(token.split('.')[1]));
      if (String(payload?.role || '').toLowerCase() === 'service_role') return true;
    } catch {
      // Not a decodable JWT payload; another detector may still classify it.
    }
  }
  return false;
}

function hardcodedNamedSecretPresent(line) {
  for (const name of HIGH_RISK_NAMES) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = line.match(new RegExp(`\\b${escaped}\\b\\s*[:=]\\s*["'\\\`]?(\\S{12,})`, 'i'));
    if (!match) continue;
    const candidate = String(match[1] || '').replace(/["'`,;)}\]]+$/g, '');
    if (candidate.length < 12 || PLACEHOLDER.test(candidate)) continue;
    return name.toLowerCase();
  }
  return '';
}

function postgresCredentialPresent(line) {
  const match = line.match(/\bpostgres(?:ql)?:\/\/([^\s/@:]+):([^\s/@]+)@([^\s/]+)/i);
  if (!match) return false;
  const joined = match.slice(1).join(':');
  return !PLACEHOLDER.test(joined) && !/^(?:user|username):(pass|password):/i.test(joined);
}

function contextualMetaTokenPresent(line) {
  if (!/(?:META|FACEBOOK|WHATSAPP|ACCESS_TOKEN)/i.test(line)) return false;
  return /\bEAA[A-Za-z0-9]{35,}\b/.test(line);
}

export function detectSecretLine(line) {
  const detectors = new Set();
  const text = String(line || '');
  for (const [id, pattern] of DIRECT_PATTERNS) {
    if (pattern.test(text)) detectors.add(id);
  }
  if (serviceRoleJwtPresent(text)) detectors.add('supabase_service_role_jwt');
  if (postgresCredentialPresent(text)) detectors.add('postgres_uri_with_password');
  if (contextualMetaTokenPresent(text)) detectors.add('meta_access_token');
  const named = hardcodedNamedSecretPresent(text);
  if (named) detectors.add(`hardcoded_${named}`);
  return [...detectors].sort();
}

function args() {
  const result = { output: 'history-secret-audit.json' };
  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] === '--output' && process.argv[index + 1]) {
      result.output = process.argv[index + 1];
      index += 1;
    }
  }
  return result;
}

async function scanHistory(outputPath) {
  const child = spawn('git', [
    'log', '--all', '--full-history', '--no-renames', '--no-ext-diff', '--text',
    '--format=@@DABBIR_COMMIT:%H', '-p', '--',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let currentCommit = '';
  let currentPath = '';
  let carry = '';
  let addedLines = 0;
  const commits = new Set();
  const hits = new Map();
  let stderr = '';

  const inspect = rawLine => {
    const line = String(rawLine || '').replace(/\r$/, '');
    if (line.startsWith('@@DABBIR_COMMIT:')) {
      currentCommit = line.slice('@@DABBIR_COMMIT:'.length).trim().toLowerCase();
      if (/^[0-9a-f]{40}$/.test(currentCommit)) commits.add(currentCommit);
      currentPath = '';
      return;
    }
    if (line.startsWith('+++ b/')) {
      currentPath = line.slice('+++ b/'.length).trim();
      return;
    }
    if (!line.startsWith('+') || line.startsWith('+++')) return;
    addedLines += 1;
    const detectors = detectSecretLine(line.slice(1));
    for (const detector of detectors) {
      const key = `${detector}\u0000${currentCommit}\u0000${currentPath}`;
      if (!hits.has(key)) hits.set(key, {
        detector,
        commit: currentCommit || null,
        path: currentPath || null,
      });
    }
  };

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr += chunk; });
  for await (const chunk of child.stdout) {
    carry += chunk;
    let newline;
    while ((newline = carry.indexOf('\n')) !== -1) {
      inspect(carry.slice(0, newline));
      carry = carry.slice(newline + 1);
    }
  }
  if (carry) inspect(carry);

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  if (exitCode !== 0) throw new Error(`GIT_HISTORY_READ_FAILED:${stderr.slice(0, 500)}`);

  const findings = [...hits.values()].sort((a, b) =>
    String(a.detector).localeCompare(String(b.detector)) ||
    String(a.commit).localeCompare(String(b.commit)) ||
    String(a.path).localeCompare(String(b.path))
  );
  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    scope: 'ALL_REACHABLE_FETCHED_REFS_ADDED_LINES',
    values_redacted_by_design: true,
    scanned_commits: commits.size,
    scanned_added_lines: addedLines,
    finding_count: findings.length,
    findings,
  };
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (findings.length) {
    console.error(`DABBIR_HISTORY_SECRET_AUDIT_FAILED findings=${findings.length}`);
    for (const finding of findings) {
      console.error(`- detector=${finding.detector} commit=${finding.commit || 'unknown'} path=${finding.path || 'unknown'}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`DABBIR_HISTORY_SECRET_AUDIT_PASS commits=${commits.size} added_lines=${addedLines}`);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const { output } = args();
  await scanHistory(output);
}
