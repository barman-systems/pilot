import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const source=readFileSync(resolve(here,'../api/app.js'),'utf8');

function showScreenBody(){
  const match=source.match(/showScreen=function\(name\)\{([\s\S]*?)\n  \};/);
  assert.ok(match,'showScreen override must exist');
  return match[1];
}

test('screen content renders before the screen becomes active',()=>{
  const body=showScreenBody();
  const renderIndex=body.indexOf('renderCurrentFast();');
  const activateIndex=body.indexOf("classList.toggle('active'");
  assert.ok(renderIndex>=0,'showScreen must render current content');
  assert.ok(activateIndex>=0,'showScreen must activate the target screen');
  assert.ok(renderIndex<activateIndex,'content must render before the visible active state is published');
});

test('screen transition does not defer required content to requestAnimationFrame',()=>{
  const body=showScreenBody();
  assert.doesNotMatch(body,/requestAnimationFrame\s*\(/,'required screen content must not wait for a later animation frame');
  assert.doesNotMatch(body,/setTimeout\s*\(/,'required screen content must not wait for a timer');
});
