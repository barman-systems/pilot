import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const REPORT = process.env.DABBIR_HISTORICAL_EXPOSURE_REPORT || 'historical-exposure-audit.json';
const REPO = process.env.GITHUB_REPOSITORY || 'barman-systems/pilot';
const TOKEN = String(process.env.GITHUB_TOKEN || '');
const MAX_BLOB_BYTES = 4 * 1024 * 1024;
const MAX_ARCHIVE_ENTRY_BYTES = 6 * 1024 * 1024;
const MAX_ARTIFACT_DOWNLOAD_BYTES = 250 * 1024 * 1024;
const MAX_LOG_DOWNLOAD_BYTES = 250 * 1024 * 1024;
const MAX_LOG_RUNS = 400;

const report = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  repository: REPO,
  head_sha: '',
  coverage: {
    refs: {},
    commits: 0,
    blobs_total: 0,
    blobs_scanned: 0,
    blobs_skipped_large_or_binary: 0,
    github_issue_items_scanned: 0,
    github_issue_comments_scanned: 0,
    github_review_comments_scanned: 0,
    github_releases_scanned: 0,
    github_forks: [],
    artifacts_total: 0,
    artifacts_scanned: 0,
    artifacts_bytes_scanned: 0,
    workflow_runs_total_reported: 0,
    workflow_runs_scanned: 0,
    workflow_log_bytes_scanned: 0,
    limitations: [],
  },
  findings: [],
  summary: {},
};

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    cwd: opts.cwd || ROOT,
    encoding: opts.encoding ?? 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: opts.maxBuffer || 512 * 1024 * 1024,
    env: opts.env || process.env,
  });
}
function tryRun(cmd, args, opts = {}) {
  try { return { ok: true, out: run(cmd, args, opts) }; }
  catch (error) { return { ok: false, error: String(error?.message || error).slice(0, 300) }; }
}
function sha256(value) {
  return crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : Buffer.from(String(value))).digest('hex').slice(0, 20);
}
function cleanPath(value) { return String(value || '').replaceAll('\\', '/').slice(0, 500); }
function lineAt(text, index) { return text.slice(0, Math.max(0, index)).split('\n').length; }
function addFinding({ detector, severity, source, path: filePath = null, line = null, object = null, commit = null, fingerprint, note = null }) {
  report.findings.push({
    detector, severity, source,
    ...(filePath ? { path: cleanPath(filePath) } : {}),
    ...(line ? { line } : {}),
    ...(object ? { object } : {}),
    ...(commit ? { commit } : {}),
    fingerprint: fingerprint || sha256(`${detector}:${source}:${filePath || ''}:${line || ''}:${object || ''}:${commit || ''}`),
    ...(note ? { note: String(note).slice(0, 300) } : {}),
  });
}
function isLikelyText(buf) {
  if (!buf?.length) return true;
  const sample = buf.subarray(0, Math.min(buf.length, 65536));
  let nul = 0, ctrl = 0;
  for (const b of sample) {
    if (b === 0) nul++;
    if (b < 9 || (b > 13 && b < 32)) ctrl++;
  }
  return nul === 0 && ctrl / Math.max(1, sample.length) < 0.02;
}
function placeholder(value) {
  const v = String(value || '').trim().toLowerCase();
  return !v || /^(?:changeme|replace[_-]?me|example|dummy|test|your[_-]|<.*>|\$\{.*\}|\{\{.*\}\}|xxx+|redacted|\*+|none|null)$/i.test(v);
}

const PATTERNS = [
  ['PRIVATE_KEY', 'critical', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['GITHUB_CLASSIC_PAT', 'critical', /\bghp_[A-Za-z0-9]{36,}\b/g],
  ['GITHUB_FINE_GRAINED_PAT', 'critical', /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g],
  ['SUPABASE_SECRET_KEY', 'critical', /\bsb_secret_[A-Za-z0-9._-]{20,}\b/g],
  ['STRIPE_LIVE_SECRET', 'critical', /\bsk_live_[A-Za-z0-9_-]{16,}\b/g],
  ['STRIPE_WEBHOOK_SECRET', 'high', /\bwhsec_[A-Za-z0-9_-]{20,}\b/g],
  ['SLACK_TOKEN', 'critical', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
  ['OPENAI_PROJECT_KEY', 'critical', /\bsk-(?:proj|svcacct)-[A-Za-z0-9_-]{20,}\b/g],
  ['ANTHROPIC_KEY', 'critical', /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g],
  ['GROQ_KEY', 'critical', /\bgsk_[A-Za-z0-9_-]{20,}\b/g],
  ['AWS_ACCESS_KEY', 'high', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ['GOOGLE_API_KEY', 'medium', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['RESEND_KEY', 'high', /\bre_[A-Za-z0-9_-]{24,}\b/g],
  ['META_LONG_TOKEN', 'high', /\bEAA[A-Za-z0-9]{70,}\b/g],
  ['DATABASE_CREDENTIAL_URL', 'critical', /\bpostgres(?:ql)?:\/\/[^:\s/@]{1,120}:[^@\s/]{8,200}@[^/\s]+\/[^\s'"`]+/g],
];

const SECRET_NAMES = [
  'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_DB_PASSWORD', 'DATABASE_URL',
  'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GROQ_API_KEY',
  'DABBIR_INTEGRATION_ENCRYPTION_KEY', 'DABBIR_WHATSAPP_APP_SECRET', 'DABBIR_WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_ACCESS_TOKEN', 'META_APP_SECRET', 'META_ACCESS_TOKEN', 'CLOUDFLARE_API_TOKEN',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'RESEND_API_KEY', 'VERCEL_TOKEN',
  'GITHUB_TOKEN', 'GH_TOKEN', 'SLACK_BOT_TOKEN', 'APPLE_PRIVATE_KEY',
];
const assignmentRe = new RegExp(
  `\\b(${SECRET_NAMES.join('|')})\\b\\s*[:=]\\s*["'\`]?([^\\s"'\\\`]{10,})`,
  'gi'
);
const jwtRe = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const emailRe = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const uaePhoneRe = /(?:\+971|00971|971)[\s-]?(?:5\d|2|3|4|6|7|9)[\s-]?\d{3}[\s-]?\d{4}\b/g;

function decodeJwtPayload(token) {
  try {
    const payload = token.split('.')[1];
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - payload.length % 4) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch { return null; }
}

function scanText(text, meta) {
  for (const [detector, severity, regex] of PATTERNS) {
    regex.lastIndex = 0;
    for (const match of text.matchAll(regex)) {
      addFinding({
        detector, severity, ...meta,
        line: meta.line ?? lineAt(text, match.index ?? 0),
        fingerprint: sha256(match[0]),
      });
    }
  }
  assignmentRe.lastIndex = 0;
  for (const match of text.matchAll(assignmentRe)) {
    const value = match[2] || '';
    if (placeholder(value)) continue;
    addFinding({
      detector: `LITERAL_${String(match[1]).toUpperCase()}`,
      severity: 'critical', ...meta,
      line: meta.line ?? lineAt(text, match.index ?? 0),
      fingerprint: sha256(value),
      note: 'Literal value assigned to a secret-bearing variable name.',
    });
  }
  jwtRe.lastIndex = 0;
  for (const match of text.matchAll(jwtRe)) {
    const payload = decodeJwtPayload(match[0]);
    if (!payload) continue;
    const role = String(payload.role || payload.user_role || '').toLowerCase();
    if (role === 'service_role' || role === 'supabase_admin') {
      addFinding({
        detector: 'PRIVILEGED_JWT',
        severity: 'critical', ...meta,
        line: meta.line ?? lineAt(text, match.index ?? 0),
        fingerprint: sha256(match[0]),
        note: `JWT payload declares privileged role ${role}.`,
      });
    }
  }
  emailRe.lastIndex = 0;
  for (const match of text.matchAll(emailRe)) {
    const value = match[0];
    if (/@(?:example\.(?:com|org|net|invalid)|example\.invalid|users\.noreply\.github\.com|github\.com)$/i.test(value)) continue;
    addFinding({
      detector: 'EMAIL_PII_CANDIDATE',
      severity: 'low', ...meta,
      line: meta.line ?? lineAt(text, match.index ?? 0),
      fingerprint: sha256(value.toLowerCase()),
    });
  }
  uaePhoneRe.lastIndex = 0;
  for (const match of text.matchAll(uaePhoneRe)) {
    addFinding({
      detector: 'UAE_PHONE_PII_CANDIDATE',
      severity: 'medium', ...meta,
      line: meta.line ?? lineAt(text, match.index ?? 0),
      fingerprint: sha256(match[0].replace(/\D/g, '')),
    });
  }
}

function suspiciousHistoricalPath(filePath, oid) {
  const p = String(filePath || '').toLowerCase();
  const base = path.posix.basename(p);
  const suspicious =
    (/(^|\/)\.env($|\.)/.test(p) && !/(example|sample|template)/.test(base)) ||
    /\.(?:pem|key|p12|pfx|jks|keystore|mobileprovision)$/i.test(p) ||
    /(?:service[-_]?account|credentials?|secrets?|google-services)\.(?:json|ya?ml)$/i.test(base) ||
    /googleservice-info\.plist$/i.test(base);
  if (suspicious) addFinding({
    detector: 'SENSITIVE_FILE_HISTORY',
    severity: 'high',
    source: 'git_path',
    path: filePath,
    object: oid,
    fingerprint: sha256(`${oid}:${filePath}`),
  });
}

function parseBatchCheck(input, pathByOid) {
  const proc = spawnSync('git', ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], {
    cwd: ROOT, input, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024,
  });
  if (proc.status !== 0) throw new Error('git cat-file --batch-check failed');
  const blobs = [];
  for (const line of proc.stdout.split('\n')) {
    if (!line.trim()) continue;
    const [oid, type, sizeRaw] = line.split(' ');
    const size = Number(sizeRaw);
    if (type === 'blob') blobs.push({ oid, size, path: pathByOid.get(oid) || '' });
  }
  return blobs;
}

function readBlobsBatch(blobs) {
  const eligible = blobs.filter(b => b.size <= MAX_BLOB_BYTES);
  const input = Buffer.from(eligible.map(b => b.oid).join('\n') + '\n');
  const proc = spawnSync('git', ['cat-file', '--batch'], {
    cwd: ROOT, input, encoding: null, maxBuffer: 768 * 1024 * 1024,
  });
  if (proc.status !== 0) throw new Error('git cat-file --batch failed');
  const buf = proc.stdout;
  let offset = 0;
  for (const blob of eligible) {
    const nl = buf.indexOf(0x0a, offset);
    if (nl < 0) break;
    const header = buf.subarray(offset, nl).toString('utf8');
    const parts = header.split(' ');
    const size = Number(parts.at(-1));
    const start = nl + 1;
    const end = start + size;
    const body = buf.subarray(start, end);
    offset = end + 1;
    if (!isLikelyText(body)) {
      report.coverage.blobs_skipped_large_or_binary++;
      continue;
    }
    report.coverage.blobs_scanned++;
    scanText(body.toString('utf8'), {
      source: 'git_blob',
      path: blob.path,
      object: blob.oid,
    });
  }
  report.coverage.blobs_skipped_large_or_binary += blobs.length - eligible.length;
}

function scanGitHistory() {
  report.head_sha = run('git', ['rev-parse', 'HEAD']).trim();
  const refs = run('git', ['for-each-ref', '--format=%(refname)']).split('\n').filter(Boolean);
  report.coverage.refs = {
    total: refs.length,
    heads: refs.filter(r => r.startsWith('refs/heads/')).length,
    remotes: refs.filter(r => r.startsWith('refs/remotes/')).length,
    tags: refs.filter(r => r.startsWith('refs/tags/')).length,
    pull_refs: refs.filter(r => r.includes('/pull/')).length,
  };
  const commits = run('git', ['rev-list', '--all']).split('\n').filter(Boolean);
  report.coverage.commits = commits.length;

  const objectLines = run('git', ['rev-list', '--objects', '--all'], { maxBuffer: 512 * 1024 * 1024 })
    .split('\n').filter(Boolean);
  const pathByOid = new Map();
  const oids = [];
  for (const row of objectLines) {
    const sp = row.indexOf(' ');
    const oid = sp < 0 ? row : row.slice(0, sp);
    const filePath = sp < 0 ? '' : row.slice(sp + 1);
    if (!pathByOid.has(oid)) pathByOid.set(oid, filePath);
    oids.push(oid);
    if (filePath) suspiciousHistoricalPath(filePath, oid);
  }
  const uniqueOids = [...new Set(oids)];
  const blobs = parseBatchCheck(uniqueOids.join('\n') + '\n', pathByOid);
  report.coverage.blobs_total = blobs.length;
  readBlobsBatch(blobs);

  const log = run('git', ['log', '--all', '--format=__DABBIR_COMMIT__%H%n%B'], { maxBuffer: 256 * 1024 * 1024 });
  let current = '';
  let message = [];
  const flush = () => {
    if (!current) return;
    scanText(message.join('\n'), { source: 'git_commit_message', commit: current });
  };
  for (const line of log.split('\n')) {
    if (line.startsWith('__DABBIR_COMMIT__')) {
      flush();
      current = line.slice('__DABBIR_COMMIT__'.length).trim();
      message = [];
    } else message.push(line);
  }
  flush();

  for (const finding of report.findings.filter(f => f.source === 'git_blob' && f.object && f.path).slice(0, 500)) {
    const r = tryRun('git', ['log', '--all', '--format=%H', `--find-object=${finding.object}`, '-1', '--', finding.path]);
    if (r.ok) finding.commit = String(r.out).trim().split('\n')[0] || null;
  }
}

async function gh(pathname, { accept = 'application/vnd.github+json' } = {}) {
  if (!TOKEN) throw new Error('GITHUB_TOKEN_MISSING');
  const res = await fetch(`https://api.github.com/repos/${REPO}${pathname}`, {
    headers: {
      authorization: `Bearer ${TOKEN}`,
      accept,
      'x-github-api-version': '2022-11-28',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`GITHUB_HTTP_${res.status}_${pathname.split('?')[0]}`);
  return res;
}
async function ghPaged(pathname, limitPages = 100) {
  const out = [];
  let page = 1;
  for (; page <= limitPages; page++) {
    const sep = pathname.includes('?') ? '&' : '?';
    const res = await gh(`${pathname}${sep}per_page=100&page=${page}`);
    const json = await res.json();
    const rows = Array.isArray(json) ? json : (json.artifacts || json.workflow_runs || json.items || []);
    out.push(...rows);
    if (rows.length < 100) break;
  }
  if (page > limitPages) report.coverage.limitations.push(`Pagination cap reached for ${pathname}.`);
  return out;
}

async function scanGithubTextSurfaces() {
  if (!TOKEN) {
    report.coverage.limitations.push('GitHub API text surfaces skipped: GITHUB_TOKEN unavailable.');
    return;
  }
  const issues = await ghPaged('/issues?state=all&sort=created&direction=asc', 100);
  report.coverage.github_issue_items_scanned = issues.length;
  for (const item of issues) {
    scanText(`${item.title || ''}\n${item.body || ''}`, {
      source: item.pull_request ? 'github_pr_body' : 'github_issue_body',
      object: String(item.number || ''),
    });
  }

  const comments = await ghPaged('/issues/comments?sort=created&direction=asc', 100);
  report.coverage.github_issue_comments_scanned = comments.length;
  for (const c of comments) scanText(String(c.body || ''), {
    source: 'github_issue_comment',
    object: String(c.id || ''),
  });

  const reviews = await ghPaged('/pulls/comments?sort=created&direction=asc', 100);
  report.coverage.github_review_comments_scanned = reviews.length;
  for (const c of reviews) scanText(String(c.body || ''), {
    source: 'github_review_comment',
    path: c.path || null,
    line: c.line || c.original_line || null,
    object: String(c.id || ''),
  });

  const releases = await ghPaged('/releases', 20);
  report.coverage.github_releases_scanned = releases.length;
  for (const r of releases) scanText(`${r.name || ''}\n${r.body || ''}`, {
    source: 'github_release',
    object: String(r.id || ''),
  });

  const forks = await ghPaged('/forks?sort=newest', 20);
  report.coverage.github_forks = forks.map(f => ({
    full_name: f.full_name,
    created_at: f.created_at,
    updated_at: f.updated_at,
  })).slice(0, 2000);
}

function listZipEntries(zipPath) {
  const r = tryRun('unzip', ['-Z1', zipPath], { maxBuffer: 64 * 1024 * 1024 });
  return r.ok ? String(r.out).split('\n').filter(Boolean) : [];
}
function extractZipEntry(zipPath, entry) {
  const proc = spawnSync('unzip', ['-p', zipPath, entry], {
    encoding: null, maxBuffer: MAX_ARCHIVE_ENTRY_BYTES + 1024,
  });
  if (proc.status !== 0 || !proc.stdout || proc.stdout.length > MAX_ARCHIVE_ENTRY_BYTES) return null;
  return proc.stdout;
}
async function downloadZip(pathname, maxBytes) {
  const res = await gh(pathname, { accept: 'application/octet-stream' });
  const len = Number(res.headers.get('content-length') || 0);
  if (len && len > maxBytes) return null;
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  if (buf.length > maxBytes) return null;
  return buf;
}
function scanArchiveBuffer(buf, meta) {
  const tmp = path.join(os.tmpdir(), `dabbir-audit-${crypto.randomUUID()}.zip`);
  fs.writeFileSync(tmp, buf);
  try {
    for (const entry of listZipEntries(tmp)) {
      suspiciousHistoricalPath(entry, meta.object || '');
      const body = extractZipEntry(tmp, entry);
      if (!body || !isLikelyText(body)) continue;
      scanText(body.toString('utf8'), { ...meta, path: entry });
    }
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

async function scanRetainedArtifacts() {
  if (!TOKEN) return;
  let page = 1;
  let all = [];
  for (; page <= 50; page++) {
    const res = await gh(`/actions/artifacts?per_page=100&page=${page}`);
    const json = await res.json();
    if (page === 1) report.coverage.artifacts_total = Number(json.total_count || 0);
    const rows = Array.isArray(json.artifacts) ? json.artifacts : [];
    all.push(...rows);
    if (rows.length < 100) break;
  }
  let used = 0;
  for (const a of all) {
    if (a.expired || !a.id || Number(a.size_in_bytes || 0) <= 0) continue;
    const size = Number(a.size_in_bytes || 0);
    if (used + size > MAX_ARTIFACT_DOWNLOAD_BYTES) {
      report.coverage.limitations.push('Artifact content scan stopped at byte budget.');
      break;
    }
    const buf = await downloadZip(`/actions/artifacts/${a.id}/zip`, Math.min(30 * 1024 * 1024, MAX_ARTIFACT_DOWNLOAD_BYTES - used)).catch(() => null);
    if (!buf) continue;
    used += buf.length;
    report.coverage.artifacts_scanned++;
    scanArchiveBuffer(buf, { source: 'github_action_artifact', object: String(a.id) });
  }
  report.coverage.artifacts_bytes_scanned = used;
}

async function scanWorkflowLogs() {
  if (!TOKEN) return;
  let runs = [];
  for (let page = 1; page <= 10 && runs.length < MAX_LOG_RUNS; page++) {
    const res = await gh(`/actions/runs?status=completed&per_page=100&page=${page}`);
    const json = await res.json();
    if (page === 1) report.coverage.workflow_runs_total_reported = Number(json.total_count || 0);
    const rows = Array.isArray(json.workflow_runs) ? json.workflow_runs : [];
    runs.push(...rows);
    if (rows.length < 100) break;
  }
  runs = runs.slice(0, MAX_LOG_RUNS);
  let used = 0;
  for (const r of runs) {
    if (used >= MAX_LOG_DOWNLOAD_BYTES) {
      report.coverage.limitations.push('Workflow log content scan stopped at byte budget.');
      break;
    }
    const buf = await downloadZip(`/actions/runs/${r.id}/logs`, Math.min(20 * 1024 * 1024, MAX_LOG_DOWNLOAD_BYTES - used)).catch(() => null);
    if (!buf) continue;
    used += buf.length;
    report.coverage.workflow_runs_scanned++;
    scanArchiveBuffer(buf, { source: 'github_action_log', object: String(r.id), commit: r.head_sha || null });
  }
  report.coverage.workflow_log_bytes_scanned = used;
  if (report.coverage.workflow_runs_total_reported > report.coverage.workflow_runs_scanned) {
    report.coverage.limitations.push(`Action log scan covered ${report.coverage.workflow_runs_scanned} retained/retrievable runs out of ${report.coverage.workflow_runs_total_reported} reported; GitHub retention and byte/time limits apply.`);
  }
}

function finalize() {
  const bySeverity = {};
  const byDetector = {};
  for (const f of report.findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    byDetector[f.detector] = (byDetector[f.detector] || 0) + 1;
  }
  const secretCandidates = report.findings.filter(f =>
    ['critical', 'high'].includes(f.severity) &&
    !f.detector.endsWith('_PII_CANDIDATE') &&
    f.detector !== 'SENSITIVE_FILE_HISTORY'
  ).length;
  report.summary = {
    findings_total: report.findings.length,
    by_severity: bySeverity,
    by_detector: byDetector,
    high_confidence_secret_candidates: secretCandidates,
    verdict: secretCandidates > 0 ? 'REVIEW_REQUIRED' : 'NO_HIGH_CONFIDENCE_SECRET_CANDIDATE_DETECTED',
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({
    verdict: report.summary.verdict,
    findings_total: report.summary.findings_total,
    high_confidence_secret_candidates: report.summary.high_confidence_secret_candidates,
    commits: report.coverage.commits,
    blobs_scanned: report.coverage.blobs_scanned,
    issue_items_scanned: report.coverage.github_issue_items_scanned,
    comments_scanned: report.coverage.github_issue_comments_scanned + report.coverage.github_review_comments_scanned,
    artifacts_scanned: report.coverage.artifacts_scanned,
    workflow_runs_scanned: report.coverage.workflow_runs_scanned,
    limitations: report.coverage.limitations.length,
  }));
}

try {
  scanGitHistory();
  await scanGithubTextSurfaces();
  await scanRetainedArtifacts();
  await scanWorkflowLogs();
} catch (error) {
  report.coverage.limitations.push(`Audit execution warning: ${String(error?.message || error).slice(0, 300)}`);
} finally {
  finalize();
}
