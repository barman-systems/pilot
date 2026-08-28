import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../supabase/functions/barman-browser-runner/index.ts',import.meta.url),'utf8');

test('browser runner accepts and forwards bounded actions',()=>{
  assert.match(source,/actions=\[\]/);
  assert.match(source,/Array\.isArray\(actions\)/);
  assert.match(source,/actions:actions\.slice\(0,30\)/);
});

test('browser runner keeps worker-secret validation and run evidence',()=>{
  assert.match(source,/x-barman-worker-secret/);
  assert.match(source,/barman_validate_worker_secret/);
  assert.match(source,/barman_record_browser_executor_run/);
});
