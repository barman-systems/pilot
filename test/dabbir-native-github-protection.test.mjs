import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = new URL('../.github/workflows/dabbir-native-github-protection.yml', import.meta.url);

function parseProtectionPolicy(source) {
  const match = source.match(/^\s*body='([^'\n]+)'\s*$/mu);
  assert.ok(match, 'native branch-protection JSON body must remain explicit and parseable');
  return JSON.parse(match[1]);
}

test('native GitHub protection bootstrap is fail-closed and requires deterministic CI plus independent pre-merge verification', async () => {
  const source = await readFile(workflow, 'utf8');
  const policy = parseProtectionPolicy(source);

  assert.match(source, /DABBIR_GITHUB_ADMIN_TOKEN/u);
  assert.match(source, /branches\/main\/protection/u);
  assert.match(source, /if \[ -z "\$\{GH_ADMIN_TOKEN:-\}" \]; then[\s\S]*?exit 1/u);
  assert.doesNotMatch(source, /continue-on-error:\s*true/u);
  assert.doesNotMatch(source, /GITHUB_TOKEN/u);

  assert.equal(policy.required_status_checks?.strict, true);
  const contexts = policy.required_status_checks?.contexts;
  assert.ok(Array.isArray(contexts), 'required status contexts must be an array');
  assert.ok(contexts.includes('test'), 'DABBIR CI test context must remain required');
  assert.ok(
    contexts.includes('BARMAN Independent Pre-Merge Gate'),
    'independent exact-SHA pre-merge gate must remain required',
  );

  assert.equal(policy.enforce_admins, true);
  assert.equal(policy.required_linear_history, true);
  assert.equal(policy.allow_force_pushes, false);
  assert.equal(policy.allow_deletions, false);
  assert.equal(policy.required_conversation_resolution, true);

  const reviews = policy.required_pull_request_reviews;
  assert.ok(reviews, 'pull request protection must remain configured');
  assert.equal(reviews.require_code_owner_reviews, false);
  assert.equal(reviews.required_approving_review_count, 0);
  assert.equal(reviews.require_last_push_approval, false);
});
