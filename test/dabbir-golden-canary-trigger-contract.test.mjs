import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflowUrl = new URL('../.github/workflows/dabbir-golden-canary.yml', import.meta.url);
const qaUrl = new URL('../supabase/functions/dabbir-golden-canary-qa/index.ts', import.meta.url);

test('Golden Canary comment trigger stays main-trusted and owner-only', async () => {
  const [workflow, qa] = await Promise.all([
    readFile(workflowUrl, 'utf8'),
    readFile(qaUrl, 'utf8'),
  ]);

  assert.match(workflow, /issue_comment:\s*\n\s*types: \[created\]/u);
  assert.match(workflow, /github\.actor == 'barmanai'/u);
  assert.match(workflow, /OWNER\|MEMBER\|COLLABORATOR/u);
  assert.match(workflow, /startsWith\(github\.event\.comment\.body, '\/dabbir-golden-canary '/u);
  assert.match(workflow, /ref: main/u);
  assert.match(workflow, /persist-credentials: false/u);
  assert.match(workflow, /needs: \[prepare, candidate-tests\]/u);

  assert.match(qa, /GH_COMMENT_ACTOR='barmanai'/u);
  assert.match(qa, /GH_COMMENT_ACTOR_ID='319216860'/u);
  assert.match(qa, /new Set\(\['workflow_dispatch','issue_comment'\]\)/u);
  assert.match(qa, /payload\.workflow_ref!==GH_WORKFLOW_REF/u);
  assert.match(qa, /payload\.ref!==GH_REF/u);
  assert.match(qa, /payload\.event_name==='issue_comment'/u);
  assert.match(qa, /payload\.actor!==GH_COMMENT_ACTOR\|\|String\(payload\.actor_id\|\|''\)!==GH_COMMENT_ACTOR_ID/u);
});

test('Golden Canary blocks promotion unless the real iPad WebKit responsive journey passes', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');

  assert.match(workflow, /run-ai-full-customer-journey-en\.mjs/u);
  assert.match(workflow, /CANARY_IPAD_JOURNEY_REPORT: dabbir-ai-customer-journey-report-ipad\.json/u);
  assert.match(workflow, /\.ipad_webkit\.verdict == \"PASS\"/u);
  assert.match(workflow, /\.ipad_webkit\.mobile_step_status == \"PASS\"/u);
  assert.match(workflow, /\.ipad_webkit\.viewport\.width == 820/u);
  assert.match(workflow, /responsive_ipad_webkit:\"PASS\"/u);
  assert.match(workflow, /Exact Preview \+ iPhone\/iPad WebKit journeys passed/u);
});
