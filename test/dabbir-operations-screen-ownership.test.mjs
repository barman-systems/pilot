import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const source=readFileSync(resolve(here,'../api/service-operations-ui.js'),'utf8');

test('unknown business type is not classified as a service business',()=>{
  assert.match(source,/const businessType=\(\)=>String\(workspace\?\.business\?\.business_type\|\|''\)\.toLowerCase\(\);/);
  assert.match(source,/const isServiceBusiness=\(\)=>Boolean\(businessType\(\)\)&&businessType\(\)!=='store';/);
  assert.doesNotMatch(source,/business_type\|\|''\)\.toLowerCase\(\)!=='store'/,'unknown workspace must not own the service operations screen');
});

test('service operations initializes through the central UI lifecycle',()=>{
  assert.match(source,/const lifecycle=window\.__dabbirUiLifecycle;/);
  assert.match(source,/lifecycle\.on\('afterRender','service-operations',initialize\);/);
  assert.match(source,/lifecycle\.on\('afterNavigate','service-operations',activateServices\);/);
  assert.doesNotMatch(source,/const baseRenderAll=renderAll;/);
  assert.doesNotMatch(source,/renderAll\s*=\s*function/);
  assert.doesNotMatch(source,/new MutationObserver/);
});

test('service screen ownership remains activity-gated without owning primary navigation',()=>{
  const ensureScreen=source.match(/function ensureScreen\(\)\{([\s\S]*?)\n  \}/)?.[1]||'';
  assert.match(ensureScreen,/if\(!isServiceBusiness\(\)\)return null;/);
  assert.doesNotMatch(source,/function\s+ensureNav\s*\(/);
  assert.doesNotMatch(source,/dabbirServicesNav/);
  assert.doesNotMatch(source,/\.dataset\.screen\s*=/);
  assert.match(source,/x-dabbir-service-operations-ui','v4-owner-control'/);
});
