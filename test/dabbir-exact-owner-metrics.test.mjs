import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dubaiDayRange } from '../api/dabbir-runtime-fast.js';

const runtimePath='api/dabbir-runtime-fast.js';
const uiPath='api/verified-metrics-ui.js';
const recoveryPath='api/app-recovery.js';
const ownerUiPath='api/dabbir-owner-first-ui.js';
const runtime=fs.readFileSync(runtimePath,'utf8');
const ui=fs.readFileSync(uiPath,'utf8');
const recovery=fs.readFileSync(recoveryPath,'utf8');
const ownerUi=fs.readFileSync(ownerUiPath,'utf8');

test('Dubai today range is exact across the UTC date boundary',()=>{
  const range=dubaiDayRange(new Date('2026-08-27T20:30:00.000Z'));
  assert.equal(range.time_zone,'Asia/Dubai');
  assert.equal(range.date_key,'2026-08-28');
  assert.equal(range.starts_at_gte,'2026-08-27T20:00:00.000Z');
  assert.equal(range.starts_at_lt,'2026-08-28T20:00:00.000Z');
});

test('owner KPIs use PostgREST exact counts under tenant RLS',()=>{
  assert.match(runtime,/prefer:\s*'count=exact'/);
  assert.match(runtime,/content-range/);
  assert.match(runtime,/state:\s*'VERIFIED_EXACT_COUNTS'/);
  assert.match(runtime,/source:\s*'SUPABASE_POSTGREST_COUNT_EXACT'/);
  for(const key of ['active_chats','today_appointments','customers','active_handoffs','open_followups','needs_attention','ai_messages','human_handoffs']){
    assert.match(runtime,new RegExp(`\\b${key}\\b`));
  }
  assert.match(runtime,/starts_at=gte\./);
  assert.match(runtime,/starts_at=lt\./);
  assert.match(runtime,/sender_type=eq\.ai&simulated=eq\.false/);
});

test('bounded list lengths are labeled as loaded rows, not exact business metrics',()=>{
  assert.match(runtime,/conversations_loaded/);
  assert.match(runtime,/customers_loaded/);
  assert.match(runtime,/appointments_loaded/);
  assert.match(runtime,/handoffs_loaded/);
  assert.match(runtime,/followups_loaded/);
  assert.doesNotMatch(runtime,/verified_metrics:\s*\{[^}]*\.length/s);
});

test('owner UI shows only verified exact counts or an em dash',()=>{
  assert.match(ui,/VERIFIED_EXACT_COUNTS/);
  assert.match(ui,/const unknown='—'/);
  assert.match(ui,/active_chats/);
  assert.match(ui,/today_appointments/);
  assert.match(ui,/open_followups/);
  assert.match(ui,/ai_messages/);
  assert.match(ui,/human_handoffs/);
  assert.match(ui,/Count unverified/);
  assert.match(ui,/العدد غير موثق/);
  assert.doesNotMatch(ui,/workspace\.conversations[^\n]*\.length/);
  assert.doesNotMatch(ui,/workspace\.messages[^\n]*\.length/);
  assert.doesNotMatch(ui,/workspace\.customers[^\n]*\.length/);
});

test('store dashboard uses exact open followups instead of a bounded followup list',()=>{
  assert.match(ui,/isStore/);
  assert.match(ui,/applyMetric\(cards\[1\],'open_followups'\)/);
  assert.match(ui,/المتابعات/);
  assert.match(ui,/Follow-ups/);
});

test('verified metrics authority loads after owner-first UI v4',()=>{
  const ownerUiIndex=recovery.indexOf('/api/dabbir-owner-first-ui');
  const metrics=recovery.indexOf('/api/verified-metrics-ui');
  assert.ok(ownerUiIndex>=0,'owner-first UI must be present');
  assert.ok(metrics>ownerUiIndex,'verified metrics must load after presentation UI');
  assert.match(ownerUi,/x-dabbir-ui-authority/);
});

test('exact metrics runtime and UI endpoints parse as Node modules',()=>{
  for(const path of [runtimePath,uiPath,recoveryPath,ownerUiPath]){
    const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
    assert.equal(result.status,0,`${path}: ${result.stderr||result.stdout}`);
  }
});
