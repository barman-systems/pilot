import test from 'node:test';
import assert from 'node:assert/strict';
import { ALWAYS_REQUIRED_PR_WORKFLOWS, classifyChangedPaths } from '../scripts/dabbir-required-pr-gates.mjs';

test('every pull request requires the DABBIR Security Gate',()=>{
  assert.deepEqual(ALWAYS_REQUIRED_PR_WORKFLOWS,['DABBIR Security Gate']);
});

test('ordinary web changes do not require mobile or live lineage gates',()=>{
  assert.deepEqual(classifyChangedPaths(['api/app.js','index.html']),{mobileCi:false,maestro:false,lineagePreflight:false});
});

test('mobile source changes require both Mobile CI and Maestro',()=>{
  assert.deepEqual(classifyChangedPaths(['mobile/src/App.tsx']),{mobileCi:true,maestro:true,lineagePreflight:false});
});

test('App Store-sensitive migration changes require Mobile CI and live lineage preflight',()=>{
  const paths=['api/_apple-iap-core.js','privacy.html','supabase/migrations/20260902150000_dabbir_apple_receipts.sql'];
  assert.deepEqual(classifyChangedPaths(paths),{mobileCi:true,maestro:false,lineagePreflight:true});
});

test('any Supabase migration requires the live DDL lineage preflight regardless of domain',()=>{
  assert.deepEqual(
    classifyChangedPaths(['supabase/migrations/20260912001000_unrelated_domain_change.sql']),
    {mobileCi:false,maestro:false,lineagePreflight:true},
  );
});

test('lineage gate implementation changes require their own live workflow',()=>{
  assert.deepEqual(
    classifyChangedPaths(['scripts/dabbir-live-ddl-lineage-preflight.mjs']),
    {mobileCi:false,maestro:false,lineagePreflight:true},
  );
});

test('Maestro workflow changes cannot bypass Maestro itself',()=>{
  assert.deepEqual(classifyChangedPaths(['.github/workflows/dabbir-ios-maestro.yml']),{mobileCi:false,maestro:true,lineagePreflight:false});
});

test('Mobile CI workflow changes require the Mobile CI gate',()=>{
  assert.deepEqual(classifyChangedPaths(['.github/workflows/dabbir-mobile-ci.yml']),{mobileCi:true,maestro:false,lineagePreflight:false});
});
