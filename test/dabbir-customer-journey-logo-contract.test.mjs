import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const journeyPaths = [
  './ai-full-customer-journey-oidc.mjs',
  './ai-full-customer-journey-v2.mjs',
  './ai-full-customer-journey.mjs',
  './dabbir-ai-full-journey-oidc.mjs',
  './dabbir-protected-live-smoke.mjs',
];
const journeySources = await Promise.all(
  journeyPaths.map((path) => readFile(new URL(path, import.meta.url), 'utf8')),
);
const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('browser journeys verify the approved app icon contract used by the deployed shell', () => {
  assert.match(indexHtml, /<div class="logo"><img src="\/dabbir-app-icon\.png" alt="DABBIR"><\/div>/);

  for (const [index, source] of journeySources.entries()) {
    const path = journeyPaths[index];
    assert.match(source, /includes\('dabbir-app-icon'\)/, `${path} must verify the deployed app icon`);
    assert.doesNotMatch(source, /includes\('dabbir-approved-icon'\)/, `${path} must not verify the retired CSS URL`);
  }
});
