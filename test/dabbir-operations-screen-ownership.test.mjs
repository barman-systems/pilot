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

test('service operations initializes after workspace render',()=>{
  assert.match(source,/const baseRenderAll=renderAll;/);
  assert.match(source,/renderAll=function\(\)\{const result=baseRenderAll\.apply\(this,arguments\);initialize\(\);return result\};/);
});

test('service screen ownership remains activity-gated',()=>{
  const ensureScreen=source.match(/function ensureScreen\(\)\{([\s\S]*?)\n  \}/)?.[1]||'';
  assert.match(ensureScreen,/if\(!isServiceBusiness\(\)\)return null;/);
  assert.match(source,/x-dabbir-service-operations-ui','v2'/);
});
