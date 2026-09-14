import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const protection = fs.readFileSync('.github/workflows/dabbir-native-github-protection.yml', 'utf8');
const engineering = fs.readFileSync('.github/agents/dabbir-engineering.agent.md', 'utf8');
const review = fs.readFileSync('.github/agents/dabbir-review.agent.md', 'utf8');
const codeowners = fs.readFileSync('.github/CODEOWNERS', 'utf8');

test('native main protection fails closed and requires the independent exact-SHA pre-merge gate', () => {
  assert.match(protection, /if \[ -z "\$\{GH_ADMIN_TOKEN:-\}" \]; then/);
  assert.match(protection, /exit 1/);
  assert.doesNotMatch(protection, /available=false/);
  assert.match(protection, /contexts":\["test","BARMAN Independent Pre-Merge Gate"\]/);
  assert.match(protection, /required\.strict !== true/);
  assert.match(protection, /contexts\.includes\('BARMAN Independent Pre-Merge Gate'\)/);
  assert.match(protection, /enforce_admins":true/);
  assert.match(protection, /required_linear_history":true/);
  assert.match(protection, /allow_force_pushes":false/);
  assert.match(protection, /allow_deletions":false/);
});

test('native protection does not resurrect a human owner approval gate', () => {
  assert.match(protection, /require_code_owner_reviews":false/);
  assert.match(protection, /required_approving_review_count":0/);
  assert.match(protection, /require_last_push_approval":false/);
  assert.match(protection, /Owner\/code-owner approval gate must remain disabled/);
  assert.match(protection, /Human approval count must remain zero/);
});

test('engineering agent is bounded to repository implementation and cannot absorb the trust root', () => {
  assert.match(engineering, /^name: dabbir-engineering$/m);
  assert.match(engineering, /^target: github-copilot$/m);
  assert.match(engineering, /^tools: \["read", "search", "edit", "execute"\]$/m);
  assert.match(engineering, /^disable-model-invocation: true$/m);
  assert.match(engineering, /^user-invocable: true$/m);
  assert.doesNotMatch(engineering, /^mcp-servers:/m);
  assert.doesNotMatch(engineering, /^tools:.*\bweb\b/m);
  assert.match(engineering, /Do not edit, delete, rename, weaken, or bypass any of these paths or controls/);
  assert.match(engineering, /`\.github\/workflows\/\*\*`/);
  assert.match(engineering, /`scripts\/barman-independent-premerge-gate\.mjs`/);
  assert.match(engineering, /Do not add MCP servers or MCP tools/);
  assert.match(engineering, /Never merge your own work, never deploy it/);
});

test('review agent remains read-only and cannot become an approval authority', () => {
  assert.match(review, /^name: dabbir-review$/m);
  assert.match(review, /^target: github-copilot$/m);
  assert.match(review, /^tools: \["read", "search"\]$/m);
  assert.match(review, /^disable-model-invocation: true$/m);
  assert.match(review, /^user-invocable: true$/m);
  assert.doesNotMatch(review, /^mcp-servers:/m);
  assert.doesNotMatch(review, /^tools:.*\b(edit|execute|web|agent)\b/m);
  assert.match(review, /Do not approve, merge, deploy/);
  assert.match(review, /NO_MODEL_BLOCKER_FOUND/);
  assert.match(review, /not `SAFE`, `APPROVED`, or `PRODUCTION_READY`/);
});

test('agent and native protection definitions are explicit trust-root ownership paths', () => {
  assert.match(codeowners, /^\/\.github\/agents\/ @barmanai$/m);
  assert.match(codeowners, /^\/\.github\/workflows\/dabbir-native-github-protection\.yml @barmanai$/m);
});
