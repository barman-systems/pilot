import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import handler from '../api/dabbir-owner-first-theme.js';

function renderClient() {
  const headers = new Map();
  let statusCode = 200;
  let body = '';
  const res = {
    status(code) { statusCode = code; return this; },
    setHeader(name, value) { headers.set(String(name).toLowerCase(), String(value)); return this; },
    end(value = '') { body = String(value ?? ''); return this; },
  };
  handler({ method: 'GET' }, res);
  return { statusCode, headers, body };
}

test('owner-first theme uses the approved DABBIR purple blue cyan visual direction', () => {
  const result = renderClient();
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers.get('x-dabbir-owner-first-theme'), 'owner-first-v1');
  assert.match(result.body, /--dabbir-brand-purple:#7c5cff/);
  assert.match(result.body, /--dabbir-brand-blue:#3e8cff/);
  assert.match(result.body, /--dabbir-brand-cyan:#46d9ff/);
  assert.match(result.body, /\.dabbir-action-center/);
  assert.match(result.body, /#screen-dashboard/);
  assert.match(result.body, /owner-first-v1/);
});

test('generated owner-first theme client is valid JavaScript', () => {
  const { body } = renderClient();
  assert.doesNotThrow(() => new Function(body));
});

test('owner-first theme preserves the approved logo image instead of replacing it with a generated background', () => {
  const { body } = renderClient();
  assert.doesNotMatch(body, /\.logo,.dabbirTopLogo\{\s*background:/);
  assert.match(body, /\.logo,.dabbirTopLogo,.dabbirAiIdentity img,.dabbirAiStatusLogo/);
});

test('app recovery loads owner-first theme last so it can safely override legacy visual polish', async () => {
  const source = await readFile(new URL('../api/app-recovery.js', import.meta.url), 'utf8');
  const theme = source.indexOf('/api/dabbir-owner-first-theme');
  const legacy = source.indexOf('/api/dabbir-ui-refinement');
  const mobile = source.indexOf('/api/dabbir-mobile-shell-v3');
  assert.ok(theme > legacy);
  assert.ok(theme > mobile);
});
