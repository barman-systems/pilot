import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyChangedPaths } from '../scripts/dabbir-required-pr-gates.mjs';

test('ordinary web changes do not require mobile release gates',()=>{
  assert.deepEqual(classifyChangedPaths(['api/app.js','index.html']),{mobileCi:false,maestro:false});
});

test('mobile source changes require both Mobile CI and Maestro',()=>{
  assert.deepEqual(classifyChangedPaths(['mobile/src/App.tsx']),{mobileCi:true,maestro:true});
});

test('App Store-sensitive backend changes require Mobile CI but not Maestro',()=>{
  const paths=['api/_apple-iap-core.js','privacy.html','supabase/migrations/20260902150000_dabbir_apple_receipts.sql'];
  assert.deepEqual(classifyChangedPaths(paths),{mobileCi:true,maestro:false});
});

test('Maestro workflow changes cannot bypass Maestro itself',()=>{
  assert.deepEqual(classifyChangedPaths(['.github/workflows/dabbir-ios-maestro.yml']),{mobileCi:false,maestro:true});
});

test('Mobile CI workflow changes require the Mobile CI gate',()=>{
  assert.deepEqual(classifyChangedPaths(['.github/workflows/dabbir-mobile-ci.yml']),{mobileCi:true,maestro:false});
});
