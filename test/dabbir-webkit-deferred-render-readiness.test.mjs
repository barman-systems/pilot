import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const bridge = await readFile(new URL('../api/dabbir-navigation-event-bridge-ui.js', import.meta.url), 'utf8');
const preload = await readFile(new URL('./dabbir-protected-full-journey-preload.mjs', import.meta.url), 'utf8');

test('navigation bridge is visual-first and defers the actual screen render', () => {
  assert.match(bridge, /visual_first:true/);
  assert.match(bridge, /deferred_render:true/);
  assert.match(bridge, /requestAnimationFrame\(\(\)=>requestAnimationFrame\(callback\)\)/);
});

test('WebKit journey waits for conversation rows after the visual-first active state', () => {
  assert.match(preload, /selectorText === '#screen-conversations\.active'/);
  assert.match(preload, /#chatList \.chatContact/);
  assert.match(preload, /content_ready/);
});
