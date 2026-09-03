import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync(new URL('../api/owner-command-center-v27.js',import.meta.url),'utf8');
const reviewed=fs.readFileSync(new URL('../api/owner-command-center-v28.js',import.meta.url),'utf8');
const active=fs.readFileSync(new URL('../api/owner-command-center-v29.js',import.meta.url),'utf8');
const gateway=fs.readFileSync(new URL('../api/owner-dashboard-gateway.js',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../api/owner-ceo-command.js',import.meta.url),'utf8');
const edge=fs.readFileSync(new URL('../supabase/functions/dabbir-owner-ceo-command/index.ts',import.meta.url),'utf8');
const queue=fs.readFileSync(new URL('../supabase/migrations/20260902113149_dabbir_ceo_command_queue_v1.sql',import.meta.url),'utf8');
const privileges=fs.readFileSync(new URL('../supabase/migrations/20260902113212_dabbir_ceo_command_queue_privileges_v1.sql',import.meta.url),'utf8');
const rpc=fs.readFileSync(new URL('../supabase/migrations/20260902113432_dabbir_ceo_command_rpc_v1.sql',import.meta.url),'utf8');

test('owner gateway routes through v29 and reviewed v28 then CEO command desk v27 while preserving v26',()=>{
  assert.match(gateway,/owner-command-center-v29\.js/);
  assert.match(active,/owner-command-center-v28\.js/);
  assert.match(reviewed,/owner-command-center-v27\.js/);
  assert.match(ui,/owner-command-center-v26\.js/);
});

test('CEO command desk is visible, trackable and truth-preserving',()=>{
  for(const token of ['أمر إلى CEO','BARMAN Executive OS','CEO COMMAND DESK','إرسال إلى CEO','تحديث الحالات','QUEUED','IN_PROGRESS','DONE','BLOCKED']) assert.match(ui,new RegExp(token));
  assert.match(ui,/\/api\/owner-ceo-command/);
  assert.match(ui,/credentials:'same-origin'/);
  assert.match(ui,/ownerCeoCommandDeskV27/);
  assert.match(ui,/لا يتم تحويل الحالة إلى منجز من الواجهة/);
  assert.doesNotMatch(ui,/SUPABASE_SERVICE_ROLE_KEY|service_role|apikey/i);
});

test('same-origin API requires owner session and bounded input',()=>{
  assert.match(api,/ownerSessionToken/);
  assert.match(api,/requireSameOrigin/);
  assert.match(api,/readJsonBody\(req,8192\)/);
  assert.match(api,/COMMAND_TEXT_INVALID/);
  assert.match(api,/PRIORITY_INVALID/);
  assert.match(api,/dabbir-owner-ceo-command/);
});

test('edge endpoint verifies platform-owner session before CEO command RPCs',()=>{
  assert.match(edge,/dabbir_owner_session_verify_v1/);
  assert.match(edge,/platform_owner/);
  assert.match(edge,/dabbir_ceo_command_create_v1/);
  assert.match(edge,/dabbir_ceo_commands_recent_v1/);
  assert.match(edge,/OWNER_SESSION_REQUIRED/);
});

test('CEO command queue is RLS protected and service role cannot delete',()=>{
  assert.match(queue,/alter table public\.dabbir_ceo_commands enable row level security/i);
  assert.match(queue,/revoke all on table public\.dabbir_ceo_commands from anon, authenticated/i);
  assert.match(privileges,/revoke all on table public\.dabbir_ceo_commands from service_role/i);
  assert.match(privileges,/grant select, insert, update on table public\.dabbir_ceo_commands to service_role/i);
  assert.doesNotMatch(privileges,/delete/i);
});

test('owner command becomes an executive event instead of a chat-only note',()=>{
  assert.match(rpc,/insert into dabbir_private\.executive_events/);
  assert.match(rpc,/'owner-directive'/);
  assert.match(rpc,/'ceo_command'/);
  assert.match(rpc,/'open'/);
  assert.match(rpc,/executive_event_status/);
});
