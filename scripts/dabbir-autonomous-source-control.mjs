import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';

const bridgeUrl = process.env.DABBIR_SOURCE_CONTROL_BRIDGE_URL || 'https://barman-browser-worker.vercel.app/api/dabbir-source-control-bridge';
const oidcToken = process.env.DABBIR_GITHUB_OIDC_TOKEN || '';
const githubToken = process.env.GITHUB_TOKEN || '';
const repository = process.env.GITHUB_REPOSITORY || 'barman-systems/pilot';
const githubRunId = process.env.GITHUB_RUN_ID || '';
const controlScript = 'scripts/dabbir-autonomous-source-control.mjs';
const workflowPath = '.github/workflows/dabbir-autonomous-source-control.yml';
const maxContextFiles = 12;
const requiredChecks = String(process.env.DABBIR_REQUIRED_CHECKS || 'test')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

if (!oidcToken) throw new Error('DABBIR_GITHUB_OIDC_TOKEN missing');
if (!githubToken) throw new Error('GITHUB_TOKEN missing');
if (repository !== 'barman-systems/pilot') throw new Error(`unexpected_repository:${repository}`);
if (!requiredChecks.length) throw new Error('DABBIR_REQUIRED_CHECKS empty');

function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (options.capture) {
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    if (result.status !== 0 && !options.allowFailure) {
      const error = new Error(`${command} failed (${result.status})`);
      error.output = output;
      throw error;
    }
    return { status: result.status ?? 1, output };
  }
  if (result.status !== 0 && !options.allowFailure) throw new Error(`${command} failed (${result.status})`);
  return { status: result.status ?? 1, output: '' };
}

function git(args, options = {}) {
  return run('git', args, options);
}

async function bridge(action, payload = {}) {
  const response = await fetch(bridgeUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${oidcToken}`,
    },
    body: JSON.stringify({ action, ...payload }),
    signal: AbortSignal.timeout(145000),
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 1000) }; }
  if (!response.ok || body?.ok === false) {
    throw new Error(`bridge_${action}_${response.status}_${String(body?.error || body?.state || 'failed').slice(0, 300)}`);
  }
  return body;
}

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    method: options.method || 'GET',
    headers: {
      accept: options.accept || 'application/vnd.github+json',
      authorization: `Bearer ${githubToken}`,
      'x-github-api-version': '2022-11-28',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok && !options.allowFailure) throw new Error(`github_${options.method || 'GET'}_${path}_${response.status}_${String(body?.message || body || '').slice(0, 300)}`);
  return { ok: response.ok, status: response.status, body };
}

async function requireProtectedMain() {
  const branch = await github('/branches/main');
  if (branch.body?.name !== 'main') throw new Error('main_branch_lookup_unverified');
  if (branch.body?.protected !== true) throw new Error('main_branch_not_protected');
  return {
    protected: true,
    head_sha: branch.body?.commit?.sha || null,
  };
}

function trackedFiles() {
  return git(['ls-files'], { capture: true }).output.split('\n').map((value) => value.trim()).filter(Boolean);
}

function objectiveTokens(objective = '') {
  return String(objective).toLowerCase().split(/[^a-z0-9_]+/).filter((token) => token.length >= 4 && !['dabbir', 'implement', 'owner', 'with', 'from', 'that', 'this'].includes(token));
}

function contextFor(objective) {
  const files = trackedFiles();
  const tokens = objectiveTokens(objective);
  const allowedPrefixes = ['api/', 'db/', 'supabase/migrations/', 'supabase/functions/', 'scripts/', 'test/', 'config/', 'locales/'];
  const allowedRoots = new Set(['index.html', 'team.html', 'package.json', 'README.md']);
  const candidates = files.filter((path) =>
    path !== controlScript && path !== workflowPath &&
    (allowedPrefixes.some((prefix) => path.startsWith(prefix)) || allowedRoots.has(path))
  );
  const scored = candidates.map((path) => {
    const lower = path.toLowerCase();
    let score = lower.includes('dabbir') ? 8 : 0;
    for (const token of tokens) if (lower.includes(token)) score += 12;
    if (path === 'package.json') score += 5;
    if (path.startsWith('test/')) score += 2;
    if (path.startsWith('api/')) score += 2;
    return { path, score };
  }).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  const selected = scored.slice(0, maxContextFiles).map(({ path }) => {
    let content = '';
    try { content = fs.readFileSync(path, 'utf8').slice(0, 14000); } catch { content = ''; }
    return { path, content };
  });
  return { manifest: files.slice(0, 1500), context: selected };
}

function sensitivePatterns() {
  return [
    new RegExp(['sk', 'live', ''].join('_'), 'i'),
    new RegExp(['STRIPE', 'LIVE'].join('_'), 'i'),
    new RegExp(`PAYMENT_${'LIVE'}\\s*[=:]\\s*true`, 'i'),
    new RegExp(`${['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_')}\\s*[=:]`, 'i'),
    new RegExp(`BEGIN (RSA|OPENSSH|EC) ${'PRIVATE'} ${'KEY'}`, 'i'),
    /verify_jwt\s*[:=]\s*false/i,
  ];
}

function localGuard() {
  const changed = git(['diff', '--name-only'], { capture: true }).output.split('\n').map((v) => v.trim()).filter(Boolean);
  if (!changed.length) throw new Error('generated_patch_has_no_changes');
  for (const path of changed) {
    if (path === workflowPath || path === controlScript || path.startsWith('.github/')) throw new Error(`automation_control_path_modified:${path}`);
    if (path.startsWith('.git/') || path.startsWith('.env') || path === 'vercel.json') throw new Error(`protected_path_modified:${path}`);
  }
  const diff = git(['diff', '--no-ext-diff'], { capture: true }).output;
  if (sensitivePatterns().some((pattern) => pattern.test(diff))) throw new Error('sensitive_or_live_change_rejected');
  return { changed, diff };
}

async function requestPatch({ claim, ciFailure = '' }) {
  const { manifest, context } = contextFor(claim.objective?.objective || claim.objective || '');
  const currentDiff = git(['diff', '--no-ext-diff'], { capture: true }).output.slice(0, 18000);
  return bridge('generate_step', {
    run_id: claim.run_id,
    lease_token: claim.lease_token,
    research: claim.research || [],
    manifest,
    context,
    current_diff: currentDiff,
    ci_failure: String(ciFailure || '').slice(0, 6000),
  });
}

function applyPatch(patch) {
  const path = '/tmp/dabbir-auto.patch';
  fs.writeFileSync(path, String(patch || ''), 'utf8');
  run('git', ['apply', '--check', path]);
  run('git', ['apply', path]);
  return localGuard();
}

function runVerification() {
  const outputs = [];
  for (const [command, args] of [
    ['npm', ['ci']],
    ['npm', ['test']],
    ['npm', ['audit', '--omit=dev', '--audit-level=high']],
  ]) {
    const result = run(command, args, { capture: true, allowFailure: true });
    outputs.push(`$ ${command} ${args.join(' ')}\n${result.output.slice(-5000)}`);
    if (result.status !== 0) return { ok: false, detail: outputs.join('\n\n').slice(-10000) };
  }
  return { ok: true, detail: outputs.join('\n\n').slice(-10000) };
}

async function generateAndVerify(claim, ciFailure = '') {
  let lastFailure = String(ciFailure || '');
  for (let localAttempt = 0; localAttempt < 2; localAttempt += 1) {
    const generated = await requestPatch({ claim, ciFailure: lastFailure });
    applyPatch(generated.patch);
    const verification = runVerification();
    if (verification.ok) return { generated, verification, guard: localGuard() };
    lastFailure = verification.detail;
    if (localAttempt === 0) {
      git(['reset', '--hard', 'HEAD']);
      git(['clean', '-fd']);
    }
  }
  throw Object.assign(new Error('local_verification_failed_after_repair'), { detail: lastFailure });
}

function configureGit() {
  git(['config', 'user.name', 'barman-dabbir-autonomous']);
  git(['config', 'user.email', 'barman-dabbir-autonomous@users.noreply.github.com']);
}

function branchFor(claim) {
  const key = String(claim.objective?.objective_key || 'dabbir').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 45);
  return `barman/dabbir-auto-${key}-${String(claim.run_id).slice(0, 8)}`;
}

async function openPullRequest({ branch, claim, headSha, verification }) {
  const sourceRef = String(claim.objective?.source_ref || 'DABBIR_LOOP');
  const title = `DABBIR autonomous: ${sourceRef} implementation unit`;
  const body = [
    '## BARMAN autonomous implementation unit',
    '',
    `Primary objective: ${claim.objective?.objective || ''}`,
    `Source: ${sourceRef}`,
    `Run: ${claim.run_id}`,
    '',
    '### Guardrails',
    '- Generated through the DABBIR five-minute evolution loop.',
    '- PR-only source change; no direct push to main.',
    '- Free-model-only generation path; no paid inference fallback.',
    '- Live payment, KYC/legal authority, secrets, and auth/RLS weakening are blocked.',
    '- External research was treated as untrusted data.',
    '- Auto-merge requires protected main and exact required DABBIR checks to succeed.',
    '',
    '### Local verification',
    '- npm ci: PASS',
    '- npm test: PASS',
    '- npm audit --omit=dev --audit-level=high: PASS',
    '',
    `Required CI checks: ${requiredChecks.join(', ')}`,
    `Head: ${headSha}`,
  ].join('\n');
  const result = await github('/pulls', { method: 'POST', body: { title, head: branch, base: 'main', body } });
  return result.body;
}

async function commitAndPush(branch, claim) {
  configureGit();
  git(['add', '-A']);
  git(['commit', '-m', `feat(dabbir): autonomous ${claim.objective?.source_ref || claim.objective?.objective_key || 'evolution'} unit`]);
  git(['push', '--set-upstream', 'origin', `HEAD:${branch}`]);
  return git(['rev-parse', 'HEAD'], { capture: true }).output.trim();
}

async function checkState(prNumber, headSha) {
  const [checks, statuses] = await Promise.all([
    github(`/commits/${headSha}/check-runs?per_page=100`),
    github(`/commits/${headSha}/status`),
  ]);
  const runs = Array.isArray(checks.body?.check_runs) ? checks.body.check_runs : [];
  const statusContexts = Array.isArray(statuses.body?.statuses) ? statuses.body.statuses : [];
  const required = requiredChecks.map((name) => {
    const matching = runs.filter((run) => run.name === name);
    const latest = matching.sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0] || null;
    return {
      name,
      found: Boolean(latest),
      status: latest?.status || null,
      conclusion: latest?.conclusion || null,
    };
  });
  const requiredMissing = required.filter((check) => !check.found);
  const requiredPending = required.filter((check) => check.found && check.status !== 'completed');
  const requiredFailed = required.filter((check) => check.found && check.status === 'completed' && check.conclusion !== 'success');
  const otherFailed = runs.filter((run) => run.status === 'completed' && ['failure', 'cancelled', 'timed_out', 'action_required', 'stale', 'startup_failure'].includes(String(run.conclusion || '')));
  const pending = runs.filter((run) => run.status !== 'completed');
  const statusFailed = statusContexts.some((item) => ['failure', 'error'].includes(String(item.state || '')));
  const statusPending = statusContexts.some((item) => ['pending'].includes(String(item.state || '')));
  const requiredPass = required.length > 0 && required.every((check) => check.found && check.status === 'completed' && check.conclusion === 'success');
  return {
    pass: requiredPass && otherFailed.length === 0 && !statusFailed && !statusPending,
    failed: requiredFailed.length > 0 || otherFailed.length > 0 || statusFailed,
    pending: requiredMissing.length > 0 || requiredPending.length > 0 || pending.length > 0 || statusPending,
    summary: {
      required_checks: required,
      required_missing: requiredMissing.map((check) => check.name),
      check_runs: runs.map((run) => ({ name: run.name, status: run.status, conclusion: run.conclusion })).slice(0, 50),
      combined_status: statuses.body?.state || null,
      status_contexts: statusContexts.map((item) => ({ context: item.context, state: item.state })).slice(0, 50),
    },
  };
}

async function mergePullRequest(prNumber, headSha) {
  const protection = await requireProtectedMain();
  const checks = await checkState(prNumber, headSha);
  if (!checks.pass) {
    return {
      ok: false,
      status: 409,
      body: {
        merged: false,
        message: 'merge_truth_gate_not_satisfied',
        protection,
        checks: checks.summary,
      },
    };
  }
  return github(`/pulls/${prNumber}/merge`, { method: 'PUT', body: { sha: headSha, merge_method: 'squash', commit_title: `DABBIR autonomous implementation (#${prNumber})` }, allowFailure: true });
}

async function report(claim, status, extra = {}) {
  return bridge('report', {
    run_id: claim.run_id,
    lease_token: claim.lease_token,
    status,
    branch_name: extra.branch_name || null,
    pr_number: extra.pr_number || null,
    head_sha: extra.head_sha || null,
    work_unit_done: extra.work_unit_done === true,
    evidence: { github_run_id: githubRunId, ...(extra.evidence || {}) },
  });
}

async function handleExisting(claim) {
  const existing = claim.run || {};
  const prNumber = Number(existing.pr_number || 0);
  if (!prNumber) return false;
  const pr = await github(`/pulls/${prNumber}`);
  if (pr.body?.merged === true) {
    await report(claim, 'MERGED', { branch_name: existing.branch_name, pr_number: prNumber, head_sha: pr.body?.merge_commit_sha || existing.head_sha, work_unit_done: true, evidence: { observed_merged: true } });
    return true;
  }
  if (pr.body?.state !== 'open') {
    await report(claim, 'BLOCKED', { branch_name: existing.branch_name, pr_number: prNumber, head_sha: existing.head_sha, evidence: { reason: `unexpected_pr_state:${pr.body?.state}` } });
    return true;
  }
  if (pr.body?.draft === true) {
    await report(claim, 'BLOCKED', { branch_name: pr.body?.head?.ref, pr_number: prNumber, head_sha: pr.body?.head?.sha || existing.head_sha, evidence: { reason: 'draft_pr_not_mergeable_by_autonomy' } });
    return true;
  }

  const headSha = pr.body?.head?.sha || existing.head_sha;
  const checks = await checkState(prNumber, headSha);
  if (checks.pass) {
    const merged = await mergePullRequest(prNumber, headSha);
    if (merged.ok && merged.body?.merged === true) {
      await report(claim, 'MERGED', { branch_name: pr.body?.head?.ref, pr_number: prNumber, head_sha: merged.body?.sha || headSha, work_unit_done: true, evidence: { ci: checks.summary, branch_protection_verified: true, merge_method: 'squash' } });
    } else {
      await report(claim, 'BLOCKED', { branch_name: pr.body?.head?.ref, pr_number: prNumber, head_sha: headSha, evidence: { ci: checks.summary, merge_status: merged.status, merge_error: merged.body?.message || null } });
    }
    return true;
  }

  if (!checks.failed) {
    await report(claim, 'CI_PENDING', { branch_name: pr.body?.head?.ref, pr_number: prNumber, head_sha: headSha, evidence: { ci: checks.summary } });
    return true;
  }

  if (Number(existing.repair_attempts || 0) >= 3) {
    await report(claim, 'BLOCKED', { branch_name: pr.body?.head?.ref, pr_number: prNumber, head_sha: headSha, evidence: { reason: 'max_ci_repair_attempts_reached', ci: checks.summary } });
    return true;
  }

  const branch = pr.body?.head?.ref;
  git(['fetch', 'origin', branch]);
  git(['checkout', '-B', branch, `origin/${branch}`]);
  const failureText = JSON.stringify(checks.summary).slice(0, 6000);
  try {
    const work = await generateAndVerify(claim, failureText);
    const newHead = await commitAndPush(branch, claim);
    await report(claim, 'CI_PENDING', { branch_name: branch, pr_number: prNumber, head_sha: newHead, evidence: { repaired_ci_failure: true, model: work.generated.model, changed: work.guard.changed, local_verification: 'PASS' } });
  } catch (error) {
    await report(claim, 'CI_FAILED', { branch_name: branch, pr_number: prNumber, head_sha: headSha, evidence: { repair_error: String(error?.message || error).slice(0, 600), local_failure: String(error?.detail || '').slice(-4000) } });
  }
  return true;
}

async function main() {
  git(['fetch', 'origin', 'main']);
  git(['checkout', '-B', 'main', 'origin/main']);
  const protection = await requireProtectedMain();
  const claim = await bridge('claim', { github_run_id: githubRunId, branch_protection_verified: protection.protected, main_head_sha: protection.head_sha });
  console.log(JSON.stringify({ state: claim.state, objective: claim.objective?.objective_key || claim.objective_key || null, run_id: claim.run_id || claim.run?.id || null, main_protected: true }, null, 2));

  if (['IDLE', 'RESEARCHING', 'BLOCKED'].includes(String(claim.state || ''))) return;
  if (!claim.run_id || !claim.lease_token) throw new Error('claim_missing_run_or_lease');
  if (await handleExisting(claim)) return;
  if (claim.state !== 'LEASED') return;

  const branch = branchFor(claim);
  git(['checkout', '-B', branch, 'origin/main']);
  try {
    const work = await generateAndVerify(claim);
    const headSha = await commitAndPush(branch, claim);
    const pr = await openPullRequest({ branch, claim, headSha, verification: work.verification });
    await report(claim, 'CI_PENDING', { branch_name: branch, pr_number: pr.number, head_sha: headSha, evidence: { model: work.generated.model, changed: work.guard.changed, local_verification: 'PASS', branch_protection_verified: true, required_checks: requiredChecks, pr_url: pr.html_url } });
    console.log(`Opened PR #${pr.number}: ${pr.html_url}`);
  } catch (error) {
    const detail = String(error?.detail || '').slice(-4000);
    await report(claim, 'FAILED', { branch_name: branch, evidence: { error: String(error?.message || error).slice(0, 800), detail } }).catch(() => {});
    throw error;
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
