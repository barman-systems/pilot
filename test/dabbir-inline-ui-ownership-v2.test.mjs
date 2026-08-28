import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../api/app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('app transformer no longer invents team or settings primary navigation',()=>{
  assert.doesNotMatch(app,/const settingsNav\s*=/);
  assert.doesNotMatch(app,/const settingsBottom\s*=/);
  assert.doesNotMatch(app,/data-dabbir-team-nav/);
  assert.doesNotMatch(app,/data-dabbir-team-mobile/);
  assert.doesNotMatch(app,/grid-template-columns:repeat\(6,1fr\)/);
});

test('duplicate legacy businessAdaptive UI layer cannot return',()=>{
  assert.doesNotMatch(app,/const businessAdaptiveUi\s*=/);
  assert.doesNotMatch(app,/function applyBusinessProfile\s*\(/);
  assert.doesNotMatch(app,/workspace\.followups\|\|\[\]\)\.length/,'bounded followup arrays must not become owner KPI truth');
});

test('app transformer only injects the three remaining inline runtime layers',()=>{
  const injection=app.match(/html = html\.replace\('<\/body>', `\$\{([\s\S]*?)\}<\/body>`\);/)?.[1]||'';
  assert.match(injection,/interfacePerformanceUi/);
  assert.match(injection,/conversationPerformanceUi/);
  assert.match(injection,/truthVisibilityUi/);
  assert.doesNotMatch(injection,/businessAdaptiveUi/);
});

test('primary owner navigation remains authored in index instead of app string replacement',()=>{
  const nav=index.match(/<nav class="nav" id="nav">([\s\S]*?)<\/nav>/)?.[1]||'';
  const destinations=[...nav.matchAll(/data-screen="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(destinations,['dashboard','conversations','appointments','customers','more']);
});
