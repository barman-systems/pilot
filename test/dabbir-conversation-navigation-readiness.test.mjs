import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bridge = fs.readFileSync(new URL('../api/dabbir-navigation-event-bridge-ui.js', import.meta.url), 'utf8');

test('conversation navigation renders already-loaded workspace content before activation', () => {
  const activate = bridge.match(/function activate\(hit,source\)\{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.match(bridge, /function renderLoadedScreen\(hit\)/);
  assert.match(bridge, /hit\?\.name!==['"]conversations['"]/);
  assert.match(bridge, /typeof renderChats===['"]function['"]/);
  assert.match(bridge, /renderChats\(\)/);
  assert.match(activate, /renderLoadedScreen\(hit\)/);
  assert.match(activate, /paint\(hit\)/);
  assert.ok(activate.indexOf('renderLoadedScreen(hit)') < activate.indexOf('paint(hit)'));
  assert.ok(activate.indexOf('paint(hit)') < activate.indexOf('showScreen(hit.name)'));
});

test('conversation pre-render remains local-only and deferred canonical rendering is preserved', () => {
  assert.match(bridge, /source:'workspace'/);
  assert.match(bridge, /loaded_conversation_content_before_activation:true/);
  assert.match(bridge, /afterPaint\(\(\)=>\{/);
  assert.match(bridge, /if\(typeof showScreen==='function'\) showScreen\(hit\.name\)/);
  assert.doesNotMatch(bridge.match(/function renderLoadedScreen\(hit\)\{([\s\S]*?)\n  \}/)?.[1] || '', /fetch\(|api\(/);
});
