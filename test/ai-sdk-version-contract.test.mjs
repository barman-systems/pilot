import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(fs.readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const packages = lock.packages || {};

test('DABBIR stays on the stable AI SDK 7 production line', () => {
  const expected={
    ai:'7.0.62',
    '@ai-sdk/openai-compatible':'3.0.44',
    zod:'4.5.4',
  };
  for (const [name,version] of Object.entries(expected)) {
    assert.equal(pkg.dependencies?.[name],version);
    assert.equal(packages[`node_modules/${name}`]?.version,version);
  }
});

test('OpenAI-compatible adapter resolves a single provider protocol line', () => {
  const compatible=packages['node_modules/@ai-sdk/openai-compatible'];
  const rootProvider=packages['node_modules/@ai-sdk/provider'];
  assert.ok(compatible);
  assert.ok(rootProvider);
  assert.ok(compatible.dependencies?.['@ai-sdk/provider']);
  assert.equal(packages['node_modules/@ai-sdk/openai-compatible/node_modules/@ai-sdk/provider'], undefined);
});

test('WorkflowAgent is not shipped until its stable dependency graph passes the production audit', () => {
  assert.equal(pkg.dependencies?.['@ai-sdk/workflow'],undefined);
  assert.equal(pkg.dependencies?.workflow,undefined);
  assert.equal(packages['node_modules/@ai-sdk/workflow'],undefined);
  assert.equal(packages['node_modules/workflow'],undefined);
});

test('unused AI telemetry integration is not shipped as a dead production dependency', () => {
  assert.equal(pkg.dependencies?.['@ai-sdk/otel'],undefined);
  assert.equal(packages['node_modules/@ai-sdk/otel'],undefined);
});
