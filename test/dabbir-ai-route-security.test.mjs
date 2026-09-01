import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../api/dabbir-ai.js', import.meta.url), 'utf8');

test('synthetic AI probes require an authenticated same-origin POST request', () => {
  assert.match(source, /SYNTHETIC_POST_AUTH_REQUIRED/);
  assert.match(source, /if \(!requireSameOrigin\(req\)\)/);
  assert.match(source, /getVerifiedUser\(accessTokenFromRequest\(req\)\)/);
  assert.match(source, /AUTH_REQUIRED/);
});

test('public GET diagnostics never invoke the AI provider', () => {
  const getStart = source.indexOf("if (req.method === 'GET')");
  const postStart = source.indexOf("if (req.method !== 'POST')");
  const getBlock = source.slice(getStart, postStart);
  assert.ok(getStart >= 0 && postStart > getStart);
  assert.doesNotMatch(getBlock, /generateDABBIRAiReply\(/);
});
