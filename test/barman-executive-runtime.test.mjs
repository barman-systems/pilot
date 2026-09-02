import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { deterministicDecision, signedBody, verifySignedBody } from '../api/_barman-executive-core.js';
import { cronAuthMode } from '../api/barman-executive-cron.js';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260902162000_barman_executive_runtime_v1.sql',import.meta.url),'utf8');
const telegram=fs.readFileSync(new URL('../supabase/functions/barman-telegram-webhook/index.ts',import.meta.url),'utf8');
const vercel=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const executiveCore=fs.readFileSync(new URL('../api/_barman-executive-core.js',import.meta.url),'utf8');

test('BARMAN runtime has atomic lease, evidence gate and private queue',()=>{
  for(const token of ['for update skip locked','lease_until','attempt_count','barman_executive_claim_v1','barman_executive_finalize_v1','DONE_REQUIRES_SUMMARY_AND_EVIDENCE','dabbir_private.dabbir_ceo_commands'])assert.match(migration,new RegExp(token,'i'));
  assert.match(migration,/char_length\(c\.command_text\) <= 160/i);
  assert.match(migration,/else 'tool_agent'/i);
  assert.match(migration,/revoke all on function public\.barman_executive_claim_v1/i);
  assert.match(migration,/grant execute on function public\.barman_executive_claim_v1[\s\S]*service_role/i);
});

test('Telegram conversation uses signed Vercel AI bridge and truth-preserving status',()=>{
  for(const token of ['barman-executive-chat','x-barman-timestamp','x-barman-signature','barman_telegram_memory_recent_v1','barman_telegram_status_v1','QUEUED لا تعني'])assert.match(telegram,new RegExp(token));
  assert.doesNotMatch(telegram,/barman_openai_api_key|api\.openai\.com/);
});

test('Telegram completion routing uses the real received_at ledger column',()=>{
  assert.match(executiveCore,/barman_telegram_updates\?command_id=.*order=received_at\.desc/);
  assert.doesNotMatch(executiveCore,/barman_telegram_updates\?command_id=.*order=created_at\.desc/);
});

test('signed bridge rejects tampering and old requests',()=>{
  const body={text:'مرحبا'},key='test-service-role-key',signed=signedBody(body,key,1000);
  assert.equal(verifySignedBody(signed.raw,signed.timestamp,signed.signature,key,1001),true);
  assert.equal(verifySignedBody(JSON.stringify({text:'نفذ'}),signed.timestamp,signed.signature,key,1001),false);
  assert.equal(verifySignedBody(signed.raw,signed.timestamp,signed.signature,key,1401),false);
});

test('deterministic fallback never turns status chatter into commands',()=>{
  assert.equal(deterministicDecision('هل نفذت؟').kind,'status');
  assert.equal(deterministicDecision('وينك').kind,'chat');
  assert.equal(deterministicDecision('نفذ فحص دبر').kind,'command');
});

test('Vercel runs the executive worker every five minutes with fail-closed cron auth',()=>{
  assert.ok(vercel.crons.some(item=>item.path==='/api/barman-executive-cron'&&item.schedule==='*/5 * * * *'));
  const official={headers:{'user-agent':'vercel-cron/1.0','x-vercel-cron-schedule':'*/5 * * * *'}};
  assert.equal(cronAuthMode(official,{VERCEL_ENV:'production'}),'vercel_schedule');
  assert.equal(cronAuthMode(official,{VERCEL_ENV:'preview'}),null);
  assert.equal(cronAuthMode(official,{VERCEL_ENV:'production',CRON_SECRET:'set'}),null);
});
