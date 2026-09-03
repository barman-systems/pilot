import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const recovery=fs.readFileSync(new URL('api/app-recovery.js',root),'utf8');
const bridge=fs.readFileSync(new URL('api/dabbir-navigation-event-bridge-ui.js',root),'utf8');
const manifest=JSON.parse(fs.readFileSync(new URL('config/dabbir-ui-bundles.json',root),'utf8'));

test('authoritative shell installs one lifecycle authority before generated UI bundles',()=>{
  assert.match(recovery,/const UI_LIFECYCLE_BOOTSTRAP/);
  assert.match(recovery,/version:'ui-lifecycle-v1'/);
  assert.match(recovery,/UI_LIFECYCLE_BOOTSTRAP \+ `\\n<script src="\/dabbir-ui-critical\.js/);
  assert.match(recovery,/const hooks=new Map\(\[\['afterRender',new Map\(\)\],\['afterNavigate',new Map\(\)\],\['afterLanguage',new Map\(\)\]\]\)/);
  assert.match(recovery,/const routes=new Map\(\)/);
});

test('lifecycle reconciliation is generation-safe for render navigation and language',()=>{
  assert.match(recovery,/const generation=\+\+renderGeneration/);
  assert.match(recovery,/generation===renderGeneration/);
  assert.match(recovery,/const generation=\+\+navigationGeneration/);
  assert.match(recovery,/generation!==navigationGeneration/);
  assert.match(recovery,/const generation=\+\+languageGeneration/);
  assert.match(recovery,/generation===languageGeneration/);
  assert.match(recovery,/emit\('afterLanguage'/);
  assert.match(recovery,/window\.__dabbirUiLifecycle\?\.reconcile\?\.\(\)/);
  assert.match(recovery,/script\.onload=\(\)=>\{[\s\S]*?__dabbirDeferredUiReady=true;[\s\S]*?__dabbirUiLifecycle\?\.reconcile/);
});

test('canonical navigation bridge registers with lifecycle instead of owning the production showScreen wrapper',()=>{
  assert.match(bridge,/lifecycle\.route\('navigation-event-bridge',routedName\)/);
  assert.match(bridge,/lifecycle\.on\('afterNavigate','navigation-event-bridge'/);
  assert.match(bridge,/window\.__dabbirShowScreenRouterDelegation='lifecycle'/);
  assert.match(bridge,/lifecycle_router_authority:/);
  assert.match(bridge,/legacy-fallback/);
});

test('architecture ceiling does not grow while lifecycle authority expands',()=>{
  const modules=[...manifest.critical,...manifest.deferred];
  assert.equal(modules.length,26);
  assert.equal(new Set(modules).size,modules.length);
});