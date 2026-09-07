import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/dabbir-production-journey-owner-trigger.yml','utf8');

test('production journey owner trigger is narrow, trusted, and capacity-safe',()=>{
  assert.match(workflow,/issue_comment:/);
  assert.match(workflow,/github\.event\.issue\.pull_request/);
  assert.match(workflow,/github\.actor == 'barmanai'/);
  assert.match(workflow,/github\.event\.comment\.body == '\/dabbir-production-journey'/);
  assert.match(workflow,/OWNER\|MEMBER\|COLLABORATOR/);
  assert.match(workflow,/actions: write/);
  assert.match(workflow,/gh workflow run dabbir-ai-customer-journey\.yml/);
  assert.match(workflow,/--ref main/);
  assert.match(workflow,/-f run_capacity=false/);
  assert.doesNotMatch(workflow,/run_capacity=true/);
  assert.doesNotMatch(workflow,/ALLOW_CAPACITY_LOAD_ON_PRODUCTION/);
});
