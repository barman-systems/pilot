import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('api/activity-profile-ui.js', root), 'utf8');

test('activity profile updates only navigation label nodes', () => {
  assert.match(
    source,
    /function setLabel\(screen,value\)\{qa\('\[data-screen="'\+screen\+'"\] \[data-label\]'\)/,
    'activity labels must target only [data-label] nodes'
  );
  assert.doesNotMatch(
    source,
    /\[data-screen="'\+screen\+'"\] span/,
    'activity profile must never overwrite icon spans with label text'
  );
});

test('legacy sidebar icon is hidden once owner-first icon system is active', () => {
  assert.match(
    source,
    /\.navBtn>\.navIcon\{display:none!important\}/,
    'legacy navIcon must not render beside the owner-first d4 navigation icon'
  );
});
