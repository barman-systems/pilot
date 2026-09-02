import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const preload = await readFile(new URL('./dabbir-protected-full-journey-preload.mjs', import.meta.url), 'utf8');
const journey = await readFile(new URL('./ai-full-customer-journey-v2.mjs', import.meta.url), 'utf8');
const isolation = await readFile(new URL('./dabbir-cross-tenant-isolation.mjs', import.meta.url), 'utf8');

const MUMBAI = 'fphpoysqdsceniwduxjq';

test('protected production journeys override stale workflow refs with canonical Mumbai QA project', () => {
  assert.match(preload, new RegExp(`MUMBAI_QA_PROJECT_REF\\s*=\\s*['\"]${MUMBAI}['\"]`));
  assert.match(preload, /process\.env\.SUPABASE_PROJECT_REF\s*=\s*MUMBAI_QA_PROJECT_REF/);
});

test('full and isolation journeys resolve QA control from SUPABASE_PROJECT_REF after preload', () => {
  assert.match(journey, /process\.env\.SUPABASE_PROJECT_REF/);
  assert.match(journey, /functions\/v1\/barman-qa-suite-runner/);
  assert.match(isolation, /process\.env\.SUPABASE_PROJECT_REF/);
  assert.match(isolation, /functions\/v1\/barman-qa-suite-runner/);
});
