import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(fs.readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));

const packages = lock.packages || {};
const compatible = packages['node_modules/@ai-sdk/openai-compatible'];
const rootProvider = packages['node_modules/@ai-sdk/provider'];
const nestedProvider = packages['node_modules/@ai-sdk/openai-compatible/node_modules/@ai-sdk/provider'];

const major = version => Number(String(version || '').split('.')[0]);

test('OpenAI-compatible provider stays on the AI SDK v6 compatibility line', () => {
  assert.equal(pkg.dependencies?.ai, '6.0.270');
  assert.equal(pkg.dependencies?.['@ai-sdk/openai-compatible'], '2.0.74');
  assert.equal(compatible?.version, '2.0.74');
});

test('direct Gemini/Groq model adapters do not reintroduce a provider protocol major mismatch', () => {
  assert.equal(major(rootProvider?.version), 3);
  assert.equal(major(compatible?.dependencies?.['@ai-sdk/provider']), 3);
  if (nestedProvider) assert.equal(major(nestedProvider.version), 3);
});
