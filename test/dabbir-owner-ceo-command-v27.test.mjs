import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const legacy=fs.readFileSync(new URL('../api/owner-command-center-v27.js',import.meta.url),'utf8');
const current=fs.readFileSync(new URL('../api/owner-command-center.js',import.meta.url),'utf8');
const gateway=fs.readFileSync(new URL('../api/owner-dashboard-gateway.js',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../api/owner-ceo-command.js',import.meta.url),'utf8');
const broker=fs.readFileSync(new URL('../supabase/functions/dabbir-owner-broker/index.ts',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260902120949_dabbir_owner_command_center_v28_core.sql',import.meta.url),'utf8');

test('v27 is preserved as rollback history while v28 is authoritative',()=>{
  assert.match(gateway,/owner-command-center\.js/);
  assert.match(gateway,/owner-command-center-v27\.js/);
  assert.match(legacy,/owner-command-center-v26\.js/);
  assert.doesNotMatch(gateway,/import dashboard from '.\/owner-command-center-v27\.js'/);
});

test('authoritative CEO mission control is visible and truth preserving',()=>{
  for(const token of ['BARMAN Executive OS','CEO Mission Control','QUEUED','IN_PROGRESS','DONE','BLOCKED','معايير القبول','الموعد النهائي']) assert.match(current,new RegExp(token));
  assert.match(current,/\/api\/owner-ceo-command/);
  assert.match(current,/setInterval/);
  assert.match(current,/15000/);
  assert.match(current,/ACTION → ARTIFACT → TEST → EVIDENCE/);
  assert.doesNotMatch(current,/SUPABASE_SERVICE_ROLE_KEY|service_role|apikey/i);
});

test('CEO command API is same-origin, bounded and routed through the unified owner broker',()=>{
  assert.match(api,/ownerBroker/);
  assert.match(api,/requireSameOrigin/);
  assert.match(api,/readJsonBody\(req,16384\)/);
  assert.match(api,/ceo_command_create/);
  assert.match(api,/ceo_command_update/);
  assert.match(api,/COMMAND_TEXT_INVALID/);
  assert.doesNotMatch(api,/DABBIR_OWNER_CEO_COMMAND_URL|dabbir-owner-ceo-command/);
});

test('unified broker owns CEO commands and owner decisions',()=>{
  for(const token of ['ceo_commands','ceo_command_create','ceo_command_update','decisions','decision_resolve','OWNER_SESSION_REQUIRED']) assert.match(broker,new RegExp(token));
});

test('CEO queue moved out of public schema and supports mission fields plus evidence timeline',()=>{
  assert.match(migration,/alter table public\.dabbir_ceo_commands set schema dabbir_private/i);
  assert.match(migration,/objective text/);
  assert.match(migration,/acceptance_criteria jsonb/);
  assert.match(migration,/due_at timestamptz/);
  assert.match(migration,/guidance jsonb/);
  assert.match(migration,/executive_evidence/);
  assert.match(migration,/revoke all on table dabbir_private\.dabbir_ceo_commands from public, anon, authenticated, service_role/i);
});
