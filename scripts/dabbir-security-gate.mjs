import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPORT_PATH = String(process.env.DABBIR_SECURITY_GATE_REPORT || 'dabbir-security-gate-report.json').trim();
const SELF_PATH = 'scripts/dabbir-security-gate.mjs';

const REQUIRED_SECURITY_TESTS = [
  'test/dabbir-security-gate.test.mjs',
  'test/dabbir-bar16-privacy-recovery-contract.test.mjs',
  'test/dabbir-whatsapp-ai-closed-loop-hardening.test.mjs',
  'test/dabbir-whatsapp-multibranch-outbound-safety.test.mjs',
  'test/dabbir-whatsapp-voice-notes-ai-v1.test.mjs',
];

const FORBIDDEN_CLIENT_SECRET_NAMES = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_PASSWORD',
  'DATABASE_URL',
  'DABBIR_INTEGRATION_ENCRYPTION_KEY',
  'DABBIR_INTEGRATION_ENCRYPTION_KEY_PREVIOUS',
  'DABBIR_WHATSAPP_APP_SECRET',
  'DABBIR_WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_ACCESS_TOKEN',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'CLOUDFLARE_API_TOKEN',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'VERCEL_TOKEN',
  'GITHUB_TOKEN',
];

const SECRET_VALUE_PATTERNS = [
  ['STRIPE_LIVE_SECRET', /sk_live_[A-Za-z0-9_-]{16,}/g],
  ['SUPABASE_SECRET', /sb_secret_[A-Za-z0-9._-]{20,}/g],
  ['GITHUB_CLASSIC_TOKEN', /ghp_[A-Za-z0-9]{36,}/g],
  ['GITHUB_FINE_GRAINED_TOKEN', /github_pat_[A-Za-z0-9_]{40,}/g],
  ['SLACK_TOKEN', /xox[baprs]-[A-Za-z0-9-]{20,}/g],
  ['PRIVATE_KEY', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
];

const clean = value => String(value ?? '').trim();
const normalizePath = value => clean(value).replaceAll('\\', '/').replace(/^\.\//, '');
const lineNumberAt = (text, index) => text.slice(0, Math.max(0, index)).split('\n').length;
const finding = (code, file, detail, line = null) => ({ code, file: normalizePath(file), line, detail: clean(detail).slice(0, 500) });

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
  });
}

function existingTextFile(file, root = process.cwd()) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) return false;
  const stat = fs.statSync(full);
  return stat.isFile() && stat.size <= 4 * 1024 * 1024;
}

function readText(file, root = process.cwd()) {
  if (!existingTextFile(file, root)) return '';
  try { return fs.readFileSync(path.join(root, file), 'utf8'); } catch { return ''; }
}

function listTrackedFiles(root = process.cwd()) {
  return git(['ls-files', '-z'], { cwd: root }).split('\0').map(normalizePath).filter(Boolean);
}

function validSha(value) {
  return /^[0-9a-f]{40}$/i.test(clean(value)) && !/^0{40}$/.test(clean(value));
}

export function changedEntries({ baseSha, headSha = 'HEAD', root = process.cwd() } = {}) {
  const base = clean(baseSha);
  const head = clean(headSha) || 'HEAD';
  if (!validSha(base)) return listTrackedFiles(root).map(file => ({ status: 'S', file }));
  const rows = git(['diff', '--name-status', '--find-renames', '--diff-filter=ACMR', `${base}...${head}`], { cwd: root });
  return rows.split('\n').map(row => row.trim()).filter(Boolean).map(row => {
    const parts = row.split('\t');
    return { status: clean(parts[0]).slice(0, 1) || 'M', file: normalizePath(parts.at(-1)) };
  });
}

export function isClientSurface(file) {
  const p = normalizePath(file);
  if (!p) return false;
  if (p.startsWith('public/') || p.startsWith('mobile/') || p.startsWith('src/') || p.startsWith('app/') || p.startsWith('components/')) return true;
  if (/^[^/]+\.(?:html|htm|jsx|tsx)$/.test(p)) return true;
  if (/^api\/(?:.*-ui|app(?:-.*)?|brand-ui|timezone-ui|dabbir-approved-icon)\.js$/.test(p)) return true;
  return false;
}

export function scanClientSource(file, source) {
  const findings = [];
  if (!isClientSurface(file)) return findings;
  for (const name of FORBIDDEN_CLIENT_SECRET_NAMES) {
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'g');
    for (const match of source.matchAll(re)) {
      findings.push(finding('CLIENT_SECRET_BOUNDARY', file, `${name} must never appear in browser/mobile-delivered source.`, lineNumberAt(source, match.index ?? 0)));
    }
  }
  return findings;
}

export function scanSecretValues(file, source) {
  const findings = [];
  if (normalizePath(file) === SELF_PATH) return findings;
  for (const [label, re] of SECRET_VALUE_PATTERNS) {
    re.lastIndex = 0;
    for (const match of source.matchAll(re)) {
      findings.push(finding('COMMITTED_SECRET_VALUE', file, `${label} pattern detected in tracked source.`, lineNumberAt(source, match.index ?? 0)));
    }
  }
  return findings;
}

function hasNearbyMarker(lines, index, marker) {
  const from = Math.max(0, index - 7);
  return lines.slice(from, index + 1).some(line => line.toLowerCase().includes(marker.toLowerCase()));
}

export function scanNewMigration(file, source) {
  const findings = [];
  const p = normalizePath(file);
  if (!/^supabase\/migrations\/.*\.sql$/i.test(p)) return findings;

  const weakenedRls = /\b(?:disable\s+row\s+level\s+security|no\s+force\s+row\s+level\s+security|set\s+row_security\s*=\s*off)\b/ig;
  for (const match of source.matchAll(weakenedRls)) {
    findings.push(finding('RLS_WEAKENING_FORBIDDEN', p, 'RLS disabling or row_security=off is forbidden in DABBIR migrations.', lineNumberAt(source, match.index ?? 0)));
  }

  const grantAll = /\bgrant\s+all(?:\s+privileges)?\b[\s\S]{0,300}?\bto\s+(?:public|anon|authenticated)\b/ig;
  for (const match of source.matchAll(grantAll)) {
    findings.push(finding('BROAD_CLIENT_GRANT_FORBIDDEN', p, 'GRANT ALL to PUBLIC/anon/authenticated is forbidden.', lineNumberAt(source, match.index ?? 0)));
  }

  const tableRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\."?([a-z0-9_]+)"?/ig;
  for (const match of source.matchAll(tableRe)) {
    const table = match[1];
    const statementEnd = source.indexOf(';', match.index ?? 0);
    const statement = source.slice(match.index ?? 0, statementEnd >= 0 ? statementEnd + 1 : Math.min(source.length, (match.index ?? 0) + 12000));
    if (!/\bbusiness_id\b/i.test(statement)) continue;
    const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const enable = new RegExp(`alter\\s+table\\s+(?:only\\s+)?public\\.\\"?${escaped}\\"?\\s+enable\\s+row\\s+level\\s+security`, 'i');
    if (!enable.test(source)) {
      findings.push(finding('TENANT_TABLE_RLS_REQUIRED', p, `New public tenant table ${table} contains business_id but does not enable RLS in the same migration.`, lineNumberAt(source, match.index ?? 0)));
    }
  }

  const chunks = source.split(/(?=create\s+(?:or\s+replace\s+)?function\b)/ig);
  for (const chunk of chunks) {
    const offset = source.indexOf(chunk);
    if (!/\bsecurity\s+definer\b/i.test(chunk)) continue;
    if (!/\bset\s+search_path\s*(?:=|to)\s*/i.test(chunk)) {
      findings.push(finding('SECURITY_DEFINER_SEARCH_PATH_REQUIRED', p, 'Every SECURITY DEFINER function must pin search_path explicitly.', lineNumberAt(source, Math.max(0, offset))));
    }
  }

  const lines = source.split('\n');
  lines.forEach((line, index) => {
    if (/\b(?:using|with\s+check)\s*\(\s*true\s*\)/i.test(line) && !hasNearbyMarker(lines, index, 'dabbir-security: allow-public-policy')) {
      findings.push(finding('PERMISSIVE_POLICY_REVIEW_REQUIRED', p, 'USING (true)/WITH CHECK (true) requires an explicit nearby "dabbir-security: allow-public-policy" review marker.', index + 1));
    }
    if (/\bgrant\s+execute\s+on\s+function\b/i.test(line) && /\bto\s+(?:public|anon)\b/i.test(line) && !hasNearbyMarker(lines, index, 'dabbir-security: allow-anon-execute')) {
      findings.push(finding('ANON_FUNCTION_EXECUTE_REVIEW_REQUIRED', p, 'Anonymous/PUBLIC function execution requires an explicit nearby "dabbir-security: allow-anon-execute" review marker.', index + 1));
    }
  });

  return findings;
}

export function scanChangedSqlAdditions(file, diffText) {
  const p = normalizePath(file);
  if (!/\.sql$/i.test(p)) return [];
  const additions = String(diffText || '').split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).map(line => line.slice(1)).join('\n');
  const findings = [];
  const checks = [
    ['RLS_WEAKENING_FORBIDDEN', /\b(?:disable\s+row\s+level\s+security|no\s+force\s+row\s+level\s+security|set\s+row_security\s*=\s*off)\b/i, 'RLS weakening cannot be introduced by a SQL change.'],
    ['BROAD_CLIENT_GRANT_FORBIDDEN', /\bgrant\s+all(?:\s+privileges)?\b[\s\S]{0,300}?\bto\s+(?:public|anon|authenticated)\b/i, 'GRANT ALL to a client role cannot be introduced.'],
    ['BYPASSRLS_FORBIDDEN', /\bbypassrls\b/i, 'BYPASSRLS cannot be introduced by application migrations.'],
  ];
  for (const [code, re, detail] of checks) if (re.test(additions)) findings.push(finding(code, p, detail));
  return findings;
}

export function scanServiceRoleEndpoint(file, source) {
  const p = normalizePath(file);
  if (!(p.startsWith('api/') || p.startsWith('supabase/functions/'))) return [];
  if (!/SUPABASE_SERVICE_ROLE_KEY|sb_secret_/i.test(source)) return [];

  const requestTenantInput = /(?:\bbody\.(?:business_id|businessId)\b|\breq\.(?:query|body)\??\.(?:business_id|businessId)\b|singleQueryValue\(\s*req\s*,\s*['"]business_id['"]\s*\)|searchParams\.get\(\s*['"]business_id['"]\s*\))/i.test(source);
  if (!requestTenantInput) return [];

  const authoritySignal = /(?:getBusinessMemberships\s*\(|membershipFor\s*\(|hasMembership\s*\(|BUSINESS_ACCESS_(?:REQUIRED|DENIED)|requireBusinessAccess|assertBusinessAccess|dabbir_user_business_access|loadConversationConnectionWithServiceKey\s*\(|loadBusinessBranchConnectionWithServiceKey\s*\(|verify[A-Za-z0-9_]*(?:Oidc|OIDC|Jwt|JWT|Signature)\s*\(|x-hub-signature-256|webhook[^\n]{0,80}signature)/i.test(source);
  if (authoritySignal) return [];
  return [finding('SERVICE_ROLE_TENANT_AUTH_REQUIRED', p, 'Server code accepts request-derived business_id while holding service-role authority but has no recognized membership, signed-provider, or OIDC tenant-authorization signal.')];
}

function diffForFile(file, { baseSha, headSha = 'HEAD', root = process.cwd() } = {}) {
  if (!validSha(baseSha)) return '';
  try { return git(['diff', '--unified=6', `${clean(baseSha)}...${clean(headSha) || 'HEAD'}`, '--', file], { cwd: root }); } catch { return ''; }
}

export function verifySecurityContracts(root = process.cwd()) {
  const findings = [];
  const requiredFiles = [
    '.github/workflows/ci.yml',
    '.github/workflows/dabbir-security-gate.yml',
    '.github/workflows/dabbir-ai-customer-journey.yml',
    'scripts/dabbir-required-pr-gates.mjs',
    'test/dabbir-cross-tenant-isolation.mjs',
    ...REQUIRED_SECURITY_TESTS,
  ];
  for (const file of requiredFiles) if (!fs.existsSync(path.join(root, file))) findings.push(finding('SECURITY_CONTRACT_FILE_MISSING', file, 'Required security-gate contract file is missing.'));
  if (findings.length) return findings;

  const ci = readText('.github/workflows/ci.yml', root);
  const gateWorkflow = readText('.github/workflows/dabbir-security-gate.yml', root);
  const journey = readText('.github/workflows/dabbir-ai-customer-journey.yml', root);
  const required = readText('scripts/dabbir-required-pr-gates.mjs', root);
  const isolation = readText('test/dabbir-cross-tenant-isolation.mjs', root);

  if (!/node\s+scripts\/dabbir-required-pr-gates\.mjs/.test(ci)) findings.push(finding('CI_SECURITY_CHAIN_MISSING', '.github/workflows/ci.yml', 'Required PR gate chaining is missing from DABBIR CI.'));
  if (!/DABBIR Security Gate/.test(required)) findings.push(finding('REQUIRED_SECURITY_WORKFLOW_MISSING', 'scripts/dabbir-required-pr-gates.mjs', 'Every PR must wait for DABBIR Security Gate.'));
  if (!/name:\s*DABBIR Security Gate/.test(gateWorkflow) || !/pull_request:/.test(gateWorkflow)) findings.push(finding('SECURITY_WORKFLOW_TRIGGER_INVALID', '.github/workflows/dabbir-security-gate.yml', 'Security workflow must be named DABBIR Security Gate and run on pull_request.'));
  if (!/node\s+scripts\/dabbir-security-gate\.mjs/.test(gateWorkflow)) findings.push(finding('SECURITY_WORKFLOW_SCRIPT_MISSING', '.github/workflows/dabbir-security-gate.yml', 'Security workflow must execute dabbir-security-gate.mjs.'));
  for (const testFile of REQUIRED_SECURITY_TESTS) if (!gateWorkflow.includes(testFile)) findings.push(finding('SECURITY_TEST_NOT_REQUIRED', '.github/workflows/dabbir-security-gate.yml', `${testFile} is not executed by the dedicated security workflow.`));

  const requiredIsolationTokens = [
    '01_create_two_disposable_identity_sets',
    '05_owner_a_cannot_read_tenant_b_runtime',
    '06_owner_b_cannot_read_tenant_a_runtime',
    '08_owner_a_whatsapp_tenant_b_denied',
    '09_owner_b_whatsapp_tenant_a_denied',
    '10_owner_a_service_catalog_tenant_b_read_denied',
    '11_owner_b_service_catalog_tenant_a_read_denied',
    '12_owner_a_service_catalog_tenant_b_write_denied',
    '13_owner_b_service_catalog_tenant_a_write_denied',
  ];
  for (const token of requiredIsolationTokens) if (!isolation.includes(token)) findings.push(finding('RUNTIME_ISOLATION_ATTACK_MISSING', 'test/dabbir-cross-tenant-isolation.mjs', `Required cross-tenant attack ${token} is missing.`));
  if (!journey.includes('test/dabbir-cross-tenant-isolation.mjs')) findings.push(finding('PRODUCTION_ISOLATION_EXECUTION_MISSING', '.github/workflows/dabbir-ai-customer-journey.yml', 'Exact-Production journey no longer runs the cross-tenant attack suite.'));
  if (!/\.checks\s*\|\s*length\)\s*>=\s*13/.test(journey)) findings.push(finding('PRODUCTION_ISOLATION_THRESHOLD_WEAK', '.github/workflows/dabbir-ai-customer-journey.yml', 'Production isolation gate must require at least 13 successful attacks/checks.'));
  return findings;
}

export function runSecurityGate({ env = process.env, root = process.cwd() } = {}) {
  const baseSha = clean(env.DABBIR_SECURITY_GATE_BASE_SHA);
  const headSha = clean(env.DABBIR_SECURITY_GATE_HEAD_SHA) || 'HEAD';
  const entries = changedEntries({ baseSha, headSha, root });
  const findings = [];
  const tracked = listTrackedFiles(root);

  for (const file of tracked) {
    if (!existingTextFile(file, root)) continue;
    const source = readText(file, root);
    findings.push(...scanClientSource(file, source));
    findings.push(...scanSecretValues(file, source));
  }

  for (const entry of entries) {
    const file = entry.file;
    if (!existingTextFile(file, root)) continue;
    const source = readText(file, root);
    if (entry.status === 'A' && /^supabase\/migrations\/.*\.sql$/i.test(file)) findings.push(...scanNewMigration(file, source));
    if (/\.sql$/i.test(file)) findings.push(...scanChangedSqlAdditions(file, diffForFile(file, { baseSha, headSha, root })));
    findings.push(...scanServiceRoleEndpoint(file, source));
  }

  findings.push(...verifySecurityContracts(root));

  const unique = [...new Map(findings.map(row => [`${row.code}|${row.file}|${row.line ?? ''}|${row.detail}`, row])).values()];
  const report = {
    gate: 'DABBIR_SECURITY_GATE_V1',
    generated_at: new Date().toISOString(),
    base_sha: validSha(baseSha) ? baseSha : null,
    head_sha: headSha,
    mode: validSha(baseSha) ? 'DIFF_PLUS_FULL_REPOSITORY_INVARIANTS' : 'FULL_REPOSITORY',
    tracked_files_scanned: tracked.length,
    changed_files_scanned: entries.length,
    verdict: unique.length === 0 ? 'PASS' : 'FAIL',
    required_failures: unique.length,
    findings: unique,
  };
  fs.writeFileSync(path.join(root, REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`);

  if (unique.length) {
    console.error(`DABBIR SECURITY GATE: FAIL findings=${unique.length}`);
    for (const row of unique) console.error(`SECURITY_FAIL code=${row.code} file=${row.file}${row.line ? `:${row.line}` : ''} detail=${row.detail}`);
  } else {
    console.log(`DABBIR SECURITY GATE: PASS tracked=${tracked.length} changed=${entries.length}`);
  }
  return report;
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const report = runSecurityGate();
  if (report.required_failures > 0) process.exitCode = 1;
}
