import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function collectTextFiles(root) {
  if (!(await exists(root))) return [];
  const out = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...await collectTextFiles(path));
      continue;
    }
    if (!entry.isFile()) continue;
    if (['.js', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.yml', '.yaml', '.sh'].includes(extname(entry.name))) {
      out.push(path);
    }
  }
  return out;
}

test('retired AWS and FalconCloud infrastructure trees stay absent', async () => {
  for (const relative of ['infra/aws-uae', 'infra/falconcloud-dubai']) {
    assert.equal(await exists(join(repoRoot, relative)), false, `${relative} must remain retired`);
  }
});

test('active DABBIR execution surfaces cannot restore retired cloud authority', async () => {
  const roots = ['.github/workflows', 'api', 'config', 'scripts', 'infra'];
  const files = [];
  for (const root of roots) files.push(...await collectTextFiles(join(repoRoot, root)));
  files.push(join(repoRoot, 'vercel-ignore-if-unaffected.sh'));

  const forbidden = [
    'infra/aws-uae',
    'infra/falconcloud-dubai',
    'aws-actions/configure-aws-credentials',
    'DabbirGithubDeployRole',
    'dabbir-github-oidc',
  ];

  const violations = [];
  for (const path of files) {
    const source = await readFile(path, 'utf8');
    for (const marker of forbidden) {
      if (source.includes(marker)) violations.push(`${path.slice(repoRoot.length + 1)} -> ${marker}`);
    }
  }

  assert.deepEqual(violations, [], `retired cloud authority reintroduced:\n${violations.join('\n')}`);
});
