import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = new URL('../.github/workflows/dabbir-native-github-protection.yml', import.meta.url);

test('native GitHub protection bootstrap is fail-closed and requires DABBIR CI plus Golden Canary', async () => {
  const source = await readFile(workflow, 'utf8');
  assert.match(source, /DABBIR_GITHUB_ADMIN_TOKEN/u);
  assert.match(source, /branches\/main\/protection/u);
  assert.match(source, /"contexts":\["test","DABBIR Golden Canary"\]/u);
  assert.match(source, /contexts\.includes\('DABBIR Golden Canary'\)/u);
  assert.match(source, /"enforce_admins":true/u);
  assert.match(source, /"allow_force_pushes":false/u);
  assert.match(source, /"allow_deletions":false/u);
  assert.match(source, /required_conversation_resolution/u);
  assert.match(source, /refusing to report Golden Canary protection as configured/u);
  assert.doesNotMatch(source, /GITHUB_TOKEN/u);
});
