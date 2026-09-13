import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workflow=fs.readFileSync(path.join(root,'.github','workflows','dabbir-github-release.yml'),'utf8');

test('GitHub releases are tag-only and semver-gated',()=>{
  assert.match(workflow,/push:[\s\S]*tags:[\s\S]*'v\*\.\*\.\*'/);
  assert.doesNotMatch(workflow,/branches:\s*\n\s*-\s*main/);
  assert.match(workflow,/\^v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\$/);
});

test('release workflow has only the permission it needs',()=>{
  assert.match(workflow,/permissions:\s*\n\s*contents: write/);
  assert.doesNotMatch(workflow,/pull-requests: write/);
  assert.doesNotMatch(workflow,/actions: write/);
  assert.match(workflow,/gh release create/);
  assert.match(workflow,/--verify-tag/);
  assert.match(workflow,/--generate-notes/);
});
