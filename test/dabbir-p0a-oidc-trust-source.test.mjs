import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const templateUrl = new URL('../infra/aws-uae/github-oidc-bootstrap.yml', import.meta.url);
const repo = 'barman-systems@319497139/pilot@1346817686';
const legacy = `repo:${repo}:environment:production`;
const workflows = [
  'dabbir-aws-uae-foundation.yml',
  'dabbir-aws-diagnose.yml',
  'dabbir-uae-ec2-check.yml',
  'dabbir-aws-stack-diagnose.yml',
  'dabbir-aws-uae-foundation-bootstrap.yml',
  'dabbir-uae-deploy-now.yml',
  'dabbir-aws-s3-permission-hotfix.yml',
  'dabbir-uae-provision-direct.yml',
  'dabbir-uae-bootstrap-supabase.yml',
  'dabbir-aws-oidc-smoke.yml',
];

const expectedSubjects = workflows.map(
  (workflow) => `repo:${repo}:environment:production:ref:refs/heads/main:workflow_ref:barman-systems/pilot/.github/workflows/${workflow}@refs/heads/main`,
);

test('P0-A AWS trust transition is exact, main-bound, workflow-bound, and non-wildcard', async () => {
  const source = await readFile(templateUrl, 'utf8');

  assert.match(source, /token\.actions\.githubusercontent\.com:aud: sts\.amazonaws\.com/u);
  assert.match(source, /Value: TRANSITION_OLD_PLUS_EXACT_MAIN_WORKFLOWS/u);
  assert.ok(!source.includes('token.actions.githubusercontent.com:sub: "*"'));
  assert.ok(!source.includes('token.actions.githubusercontent.com:sub: repo:barman-systems@319497139/pilot@1346817686:*'));
  assert.ok(!source.includes('StringLike:\n                token.actions.githubusercontent.com:sub'));

  const subjectLines = source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- repo:barman-systems@319497139/pilot@1346817686:'))
    .map((line) => line.slice(2));

  assert.deepEqual(subjectLines, [legacy, ...expectedSubjects]);
  assert.equal(subjectLines.length, 11);

  for (const subject of expectedSubjects) {
    assert.match(subject, /:environment:production:ref:refs\/heads\/main:workflow_ref:/u);
    assert.match(subject, /@refs\/heads\/main$/u);
  }
});
