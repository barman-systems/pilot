import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const workflowsDir = new URL('../.github/workflows/', import.meta.url);
const awsArchiveDir = new URL('../infra/aws-uae/', import.meta.url);
const awsReadmeUrl = new URL('../infra/aws-uae/README.md', import.meta.url);

const retiredWorkflows = [
  'dabbir-aws-diagnose.yml',
  'dabbir-aws-infra-ci.yml',
  'dabbir-aws-oidc-smoke.yml',
  'dabbir-aws-s3-permission-hotfix.yml',
  'dabbir-aws-stack-diagnose.yml',
  'dabbir-aws-uae-foundation-bootstrap.yml',
  'dabbir-aws-uae-foundation.yml',
  'dabbir-oidc-subject-migrate-once.yml',
  'dabbir-p0a-aws-trust-preflight-once.yml',
  'dabbir-uae-bootstrap-supabase.yml',
  'dabbir-uae-deploy-now.yml',
  'dabbir-uae-ec2-check.yml',
  'dabbir-uae-infra.yml',
  'dabbir-uae-provision-direct.yml',
];

test('P0-A AWS migration execution authority stays retired from active GitHub workflows', async () => {
  const workflowNames = await readdir(workflowsDir);

  for (const retired of retiredWorkflows) {
    assert.equal(
      workflowNames.includes(retired),
      false,
      `retired AWS workflow returned: ${retired}`,
    );
  }

  for (const name of workflowNames.filter((entry) => /\.ya?ml$/u.test(entry))) {
    const source = await readFile(new URL(name, workflowsDir), 'utf8');
    assert.doesNotMatch(source, /DabbirGithubDeployRole/u, `${name} revives the retired AWS role`);
    assert.doesNotMatch(source, /AWS_DABBIR_DEPLOY_ROLE_ARN/u, `${name} revives the retired AWS role variable`);
    assert.doesNotMatch(source, /infra\/aws-uae\//u, `${name} revives the retired AWS migration path`);
  }
});

test('P0-A retired AWS OIDC bootstrap cannot be redeployed from the repository', async () => {
  const archiveNames = await readdir(awsArchiveDir);
  assert.equal(
    archiveNames.includes('github-oidc-bootstrap.yml'),
    false,
    'retired GitHub/AWS OIDC bootstrap source must remain absent',
  );
});

test('P0-A AWS archive states current Production truth and external decommission boundary', async () => {
  const readme = await readFile(awsReadmeUrl, 'utf8');
  assert.match(readme, /Status:\s*RETIRED \/ HISTORICAL ONLY/u);
  assert.match(readme, /Current DABBIR Production remains on the existing Vercel\/Supabase authority/u);
  assert.match(readme, /Live AWS account decommission is tracked separately/u);
  assert.match(readme, /must not silently revive this migration path/u);
});
