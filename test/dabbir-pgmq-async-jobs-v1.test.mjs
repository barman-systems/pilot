import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260909035243_dabbir_pgmq_async_jobs_v1.sql'), 'utf8');

test('Supabase pgmq durable async queue is created idempotently', () => {
  assert.match(migration, /create extension if not exists pgmq/i);
  assert.match(migration, /pgmq\.meta[\s\S]+queue_name\s*=\s*'dabbir_async_jobs'/i);
  assert.match(migration, /pgmq\.create\('dabbir_async_jobs'\)/i);
});

test('async queue RPCs are service-role only and bounded', () => {
  for (const fn of ['dabbir_async_enqueue_v1', 'dabbir_async_claim_v1', 'dabbir_async_complete_v1']) {
    assert.match(migration, new RegExp(`create or replace function public\\.${fn}`, 'i'));
  }
  assert.match(migration, /auth\.role\(\)[\s\S]+service_role/i);
  assert.match(migration, /revoke all on function public\.dabbir_async_enqueue_v1[\s\S]+public,anon,authenticated/i);
  assert.match(migration, /grant execute on function public\.dabbir_async_enqueue_v1[\s\S]+service_role/i);
  assert.match(migration, /PAYLOAD_TOO_LARGE/);
  assert.match(migration, /INVALID_MAX_ATTEMPTS/);
  assert.match(migration, /INVALID_VISIBILITY_SECONDS/);
});

test('claim uses pgmq visibility semantics and completion archives evidence', () => {
  assert.match(migration, /pgmq\.read\([\s\S]+vt\s*=>\s*p_visibility_seconds[\s\S]+qty\s*=>\s*p_limit/i);
  assert.match(migration, /conditional\s*=>[\s\S]+jsonb_build_object\('type',p_job_type\)/i);
  assert.match(migration, /pgmq\.archive\('dabbir_async_jobs',\s*p_msg_id\)/i);
});
