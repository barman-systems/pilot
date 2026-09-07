import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectGitPatch, normalizeGitPatchInput } from '../scripts/barman-patch-format.mjs';

const validDiff=`diff --git a/example.txt b/example.txt\nindex 1111111..2222222 100644\n--- a/example.txt\n+++ b/example.txt\n@@ -1 +1 @@\n-old\n+new\n`;

test('normalizes fenced unified diff and strips leading prose',()=>{
  const input=`Here is the patch:\n\n\`\`\`diff\n${validDiff}\`\`\``;
  assert.equal(normalizeGitPatchInput(input),validDiff);
  const inspected=inspectGitPatch(input);
  assert.equal(inspected.ok,true);
  assert.equal(inspected.patch,validDiff);
});

test('rejects apply_patch format with actionable repair guidance',()=>{
  const inspected=inspectGitPatch(`*** Begin Patch\n*** Update File: example.txt\n@@\n-old\n+new\n*** End Patch`);
  assert.equal(inspected.ok,false);
  assert.match(inspected.error,/PATCH_FORMAT_INVALID_APPLY_PATCH/);
  assert.match(inspected.error,/raw git unified diff/i);
  assert.match(inspected.error,/numeric @@/i);
});

test('rejects non numeric unified diff hunks before git apply',()=>{
  const inspected=inspectGitPatch(`--- a/example.txt\n+++ b/example.txt\n@@\n-old\n+new\n`);
  assert.equal(inspected.ok,false);
  assert.match(inspected.error,/PATCH_FORMAT_INVALID_UNIFIED_DIFF/);
});
