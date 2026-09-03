import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const shell=fs.readFileSync(new URL('../api/app-safari-recovery.js',import.meta.url),'utf8');
const smoke=fs.readFileSync(new URL('./dabbir-protected-live-smoke.mjs',import.meta.url),'utf8');

test('owner-first diagnostics expose failure without promoting failed initialization to ready',()=>{
  assert.match(shell,/__dabbirOwnerFirstInitError=null/);
  assert.match(shell,/stage:'before_owner_first'/);
  assert.match(shell,/stage:'window_error'/);
  assert.match(shell,/stage:'unhandled_rejection'/);
  assert.match(shell,/stage:\(window\.__dabbirUiAuthority&&window\.__dabbirUiAuthority\.version==='owner-first-v4'\)\?'ready':'missing_authority'/);
  assert.doesNotMatch(shell,/__dabbirUiAuthority=\{version:'owner-first-v4'.*before_owner_first/s);
});

test('protected WebKit smoke reports diagnostics but still requires the real authority',()=>{
  assert.match(smoke,/inline_state: window\.__dabbirOwnerFirstInlineState \|\| null/);
  assert.match(smoke,/init_error: window\.__dabbirOwnerFirstInitError \|\| null/);
  assert.match(smoke,/authority: window\.__dabbirUiAuthority \|\| null/);
  assert.match(smoke,/diagnostics\?\.authority\?\.version !== 'owner-first-v4'/);
  assert.match(smoke,/diagnostics\?\.inline_state\?\.stage === 'ready'/);
});

test('mobile menu target cannot regress below 44px on the canonical root',()=>{
  assert.match(shell,/#appShell #menuBtn\{min-width:44px!important;min-height:44px!important/);
  assert.match(shell,/flex-shrink:0!important/);
});
