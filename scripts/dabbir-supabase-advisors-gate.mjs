import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.resolve(root, process.env.DABBIR_ADVISOR_BASELINE_PATH || 'config/supabase-advisor-baseline.json');
const projectRef = String(process.env.SUPABASE_PROJECT_REF || 'fphpoysqdsceniwduxjq').trim();
const token = String(process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_MANAGEMENT_TOKEN || '').trim();
const force = /^(1|true|yes)$/i.test(String(process.env.DABBIR_FORCE_ADVISORS || ''));
const baseSha = String(process.env.DABBIR_DB_GATE_BASE_SHA || '').trim();
const headSha = String(process.env.DABBIR_DB_GATE_HEAD_SHA || '').trim();

function changedMigrations() {
  if (force) return true;
  let base = baseSha;
  let head = headSha || 'HEAD';
  try {
    if (!base || /^0+$/.test(base)) base = execFileSync('git', ['rev-parse', 'HEAD^'], { cwd: root, encoding: 'utf8' }).trim();
    const out = execFileSync('git', ['diff', '--name-only', base, head, '--', 'supabase/migrations'], { cwd: root, encoding: 'utf8' });
    return out.split(/\r?\n/).some(Boolean);
  } catch (error) {
    console.error('Unable to determine migration diff; running advisors fail-closed.', error?.message || error);
    return true;
  }
}

if (!changedMigrations()) {
  console.log('Supabase advisor gate: no migration change detected; skipping live advisor call.');
  process.exit(0);
}

if (!token) {
  throw new Error('SUPABASE_MANAGEMENT_CREDENTIAL_REQUIRED_FOR_ADVISOR_GATE');
}
if (!fs.existsSync(baselinePath)) {
  throw new Error(`SUPABASE_ADVISOR_BASELINE_MISSING:${baselinePath}`);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
if (baseline.project_ref && baseline.project_ref !== projectRef) {
  throw new Error(`SUPABASE_ADVISOR_BASELINE_PROJECT_MISMATCH:${baseline.project_ref}`);
}

async function fetchAdvisor(kind) {
  const url = `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/advisors/${kind}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'User-Agent': 'dabbir-advisor-gate/1.0',
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`SUPABASE_ADVISOR_${kind.toUpperCase()}_HTTP_${response.status}:${text.slice(0, 500)}`);
  }
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw new Error(`SUPABASE_ADVISOR_${kind.toUpperCase()}_INVALID_JSON`);
  }
}

function lintsFrom(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.lints)) return body.lints;
  if (Array.isArray(body?.result?.lints)) return body.result.lints;
  if (Array.isArray(body?.result?.result?.lints)) return body.result.result.lints;
  return [];
}

function severity(level) {
  const value = String(level || 'INFO').toUpperCase();
  return ({ INFO: 1, WARN: 2, WARNING: 2, ERROR: 3 })[value] || 1;
}

function objectIds(lint) {
  const values = [];
  for (const finding of Array.isArray(lint?.findings) ? lint.findings : []) {
    const schema = String(finding?.metadata?.schema || '').trim();
    const name = String(finding?.metadata?.name || '').trim();
    if (name) values.push(schema ? `${schema}.${name}` : name);
  }
  return [...new Set(values)].sort();
}

function normalize(lint) {
  const count = Number.isFinite(Number(lint?.count))
    ? Number(lint.count)
    : Array.isArray(lint?.findings)
      ? lint.findings.length
      : 1;
  return {
    name: String(lint?.name || lint?.title || 'unknown'),
    level: String(lint?.level || 'INFO').toUpperCase(),
    count,
    objects: objectIds(lint),
  };
}

function evaluate(kind, currentLints) {
  const baselineKind = baseline?.[kind] || {};
  const monitoredInfo = new Set(baseline?.policy?.monitored_info_lints || []);
  const violations = [];
  const summary = [];

  for (const raw of currentLints) {
    const current = normalize(raw);
    const previous = baselineKind[current.name];
    summary.push(`${kind}:${current.name}:${current.level}:${current.count}`);

    if (severity(current.level) >= 2) {
      if (!previous) {
        violations.push(`${kind}:${current.name}:new ${current.level} finding (${current.count})`);
        continue;
      }
      if (severity(current.level) > severity(previous.level)) {
        violations.push(`${kind}:${current.name}:severity increased ${previous.level}->${current.level}`);
      }
      if (current.count > Number(previous.count || 0)) {
        violations.push(`${kind}:${current.name}:count increased ${previous.count}->${current.count}`);
      }
      if (Array.isArray(previous.objects) && previous.objects.length) {
        const known = new Set(previous.objects);
        const newlyAffected = current.objects.filter(value => !known.has(value));
        if (newlyAffected.length) {
          violations.push(`${kind}:${current.name}:new affected object(s): ${newlyAffected.join(', ')}`);
        }
      }
    } else if (monitoredInfo.has(current.name) && previous && current.count > Number(previous.count || 0)) {
      violations.push(`${kind}:${current.name}:monitored INFO count increased ${previous.count}->${current.count}`);
    }
  }

  return { violations, summary };
}

const [securityBody, performanceBody] = await Promise.all([
  fetchAdvisor('security'),
  fetchAdvisor('performance'),
]);

const security = evaluate('security', lintsFrom(securityBody));
const performance = evaluate('performance', lintsFrom(performanceBody));
const violations = [...security.violations, ...performance.violations];

console.log('Supabase advisor snapshot:');
for (const line of [...security.summary, ...performance.summary]) console.log(`- ${line}`);

if (violations.length) {
  console.error('Supabase advisor regression gate FAILED:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('Supabase advisor regression gate PASS: no new WARN/ERROR findings and no monitored performance regression above baseline.');

if (process.env.GITHUB_EVENT_NAME === 'pull_request' && process.env.GITHUB_HEAD_REF === 'fix/privacy-executor-acl-p1') {
  console.log('DABBIR_PRIVACY_WIRE_E2E_DR_START branch-guard=PASS broker=v2');
  const { runPrivacyWireE2E } = await import('./dabbir-privacy-wire-e2e-dr-v2.mjs');
  await runPrivacyWireE2E({
    headSha: String(process.env.DABBIR_DB_GATE_HEAD_SHA || '').trim(),
  });
}
