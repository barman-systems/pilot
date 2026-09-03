import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const owner=read('api/owner-operations-ui.js');
const service=read('api/service-operations-ui.js');

test('owner operations uses central lifecycle instead of global render/navigation monkey-patches',()=>{
  assert.match(owner,/window\.__dabbirUiLifecycle/);
  assert.match(owner,/lifecycle\.on\('afterRender','owner-operations',syncOperationsUi\)/);
  assert.match(owner,/lifecycle\.on\('afterNavigate','owner-operations',activateOperations\)/);
  assert.doesNotMatch(owner,/showScreen\s*=\s*function/);
  assert.doesNotMatch(owner,/renderAll\s*=\s*function/);
  assert.doesNotMatch(owner,/setInterval\s*\(/);
});

test('service operations uses lifecycle activation without screen-class observers or render monkey-patches',()=>{
  assert.match(service,/window\.__dabbirUiLifecycle/);
  assert.match(service,/lifecycle\.on\('afterRender','service-operations',initialize\)/);
  assert.match(service,/lifecycle\.on\('afterNavigate','service-operations',activateServices\)/);
  assert.doesNotMatch(service,/renderAll\s*=\s*function/);
  assert.doesNotMatch(service,/setLanguage\s*=\s*function/);
  assert.doesNotMatch(service,/new MutationObserver/);
  assert.doesNotMatch(service,/setInterval\s*\(/);
});
