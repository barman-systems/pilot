import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/dabbir-public-owner-link.yml', import.meta.url), 'utf8');

test('public owner link guard runs on every main release, not only workflow-file edits', () => {
  assert.match(workflow, /push:\s*\n\s*branches:\s*\[main\]/);
  assert.doesNotMatch(workflow, /push:[\s\S]{0,160}?paths:/);
});

test('public owner link guard removes only Vercel SSO and preserves application auth checks', () => {
  assert.match(workflow, /"ssoProtection":null/);
  assert.match(workflow, /\.authenticated == false/);
  assert.match(workflow, /\.error == "AUTH_REQUIRED"/);
  assert.match(workflow, /dabbir-public-owner-link-production/);
});
